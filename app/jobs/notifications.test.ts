import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { notify, outboxTransport } from "~/lib/notifier.server";
import { runNotificationsJob } from "./notifications";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date("2026-11-18T12:00:00.000Z");

function daysBefore(days: number): string {
  const when = new Date(NOW);
  when.setDate(when.getDate() - days);
  return when.toISOString();
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  const mod = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "L1", position: 1 })
    .returning()
    .get().id;
  db.insert(schema.enrollments)
    .values({ userId: base.user.id, courseId: base.course.id })
    .run();
});

describe("re-engagement scheduled job", () => {
  it("fires exactly one notification for an enrollment past the threshold, and is idempotent on re-run", async () => {
    // Last activity 30 days ago → well past threshold.
    db.insert(schema.videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId,
        eventType: "progress",
        positionSeconds: 120,
        createdAt: daysBefore(30),
      })
      .run();

    const directory = mkdtempSync(join(tmpdir(), "notifications-outbox-"));
    const transport = outboxTransport(directory);
    const injected = (n: Parameters<typeof notify>[0]) =>
      notify(n, transport);

    await runNotificationsJob(db, NOW, injected);

    const files = readdirSync(directory);
    expect(files).toHaveLength(1);
    const written = JSON.parse(readFileSync(join(directory, files[0]), "utf8"));
    expect(written).toMatchObject({
      subscriberId: String(base.user.id),
      category: "re-engagement",
      payload: {
        courseTitle: "Test Course",
        courseUrl: "/courses/test-course",
      },
    });

    const sentRows = db.select().from(schema.notificationsSent).all();
    expect(sentRows).toHaveLength(1);
    expect(sentRows[0]).toMatchObject({
      subscriberId: String(base.user.id),
      category: "re-engagement",
    });

    // Re-run: should emit nothing new.
    await runNotificationsJob(db, NOW, injected);
    expect(readdirSync(directory)).toHaveLength(1);
    expect(db.select().from(schema.notificationsSent).all()).toHaveLength(1);
  });

  it("re-notifies on a new crossing: come back, lapse again → fresh nudge", async () => {
    // First lapse: last watched 30 days ago.
    db.insert(schema.videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId,
        eventType: "progress",
        positionSeconds: 120,
        createdAt: daysBefore(30),
      })
      .run();

    const directory = mkdtempSync(join(tmpdir(), "notifications-outbox-"));
    const injected = (n: Parameters<typeof notify>[0]) =>
      notify(n, outboxTransport(directory));

    await runNotificationsJob(db, NOW, injected);
    expect(
      readdirSync(directory).filter((f) => f.includes("re-engagement"))
    ).toHaveLength(1);

    // Re-run on the same day: no new nudge (same crossing bucket).
    await runNotificationsJob(db, NOW, injected);
    expect(
      readdirSync(directory).filter((f) => f.includes("re-engagement"))
    ).toHaveLength(1);

    // Learner comes back 20 days later → new activity, new last-activity bucket.
    db.insert(schema.videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId,
        eventType: "progress",
        positionSeconds: 200,
        createdAt: daysBefore(10),
      })
      .run();

    // Still past threshold (10 days ≥ 7 days). Different bucket → new nudge.
    await runNotificationsJob(db, NOW, injected);
    expect(
      readdirSync(directory).filter((f) => f.includes("re-engagement"))
    ).toHaveLength(2);
  });

  it("does not fire for an enrollment active within the threshold", async () => {
    db.insert(schema.videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId,
        eventType: "progress",
        positionSeconds: 120,
        createdAt: daysBefore(2),
      })
      .run();

    const directory = mkdtempSync(join(tmpdir(), "notifications-outbox-"));
    const injected = (n: Parameters<typeof notify>[0]) =>
      notify(n, outboxTransport(directory));

    await runNotificationsJob(db, NOW, injected);

    expect(readdirSync(directory)).toHaveLength(0);
    expect(db.select().from(schema.notificationsSent).all()).toHaveLength(0);
  });
});

describe("completion nudge scheduled job", () => {
  it("fires once for an enrollment past the near-completion threshold, and is idempotent on re-run", async () => {
    // Give the lesson a duration so totalSeconds is defined. 10 minutes = 600s.
    db.update(schema.lessons)
      .set({ durationMinutes: 10 })
      .where(eq(schema.lessons.id, lessonId))
      .run();

    // Watched 500s / 600s = 0.833… — past 0.8 threshold.
    db.insert(schema.videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId,
        eventType: "progress",
        positionSeconds: 500,
        createdAt: daysBefore(1),
      })
      .run();

    const directory = mkdtempSync(join(tmpdir(), "notifications-outbox-"));
    const transport = outboxTransport(directory);
    const injected = (n: Parameters<typeof notify>[0]) =>
      notify(n, transport);

    await runNotificationsJob(db, NOW, injected);

    const files = readdirSync(directory);
    const completionFiles = files.filter((f) => f.includes("completion"));
    expect(completionFiles).toHaveLength(1);
    const written = JSON.parse(
      readFileSync(join(directory, completionFiles[0]), "utf8")
    );
    expect(written).toMatchObject({
      subscriberId: String(base.user.id),
      category: "completion",
      payload: {
        courseTitle: "Test Course",
        watchedSeconds: 500,
        totalSeconds: 600,
      },
    });

    const sent = db
      .select()
      .from(schema.notificationsSent)
      .where(eq(schema.notificationsSent.category, "completion"))
      .all();
    expect(sent).toHaveLength(1);

    // Re-run — no new completion entries.
    await runNotificationsJob(db, NOW, injected);
    expect(
      readdirSync(directory).filter((f) => f.includes("completion"))
    ).toHaveLength(1);
    expect(
      db
        .select()
        .from(schema.notificationsSent)
        .where(eq(schema.notificationsSent.category, "completion"))
        .all()
    ).toHaveLength(1);
  });

  it("does not fire if the enrollment is already marked completed", async () => {
    db.update(schema.lessons)
      .set({ durationMinutes: 10 })
      .where(eq(schema.lessons.id, lessonId))
      .run();
    db.update(schema.enrollments)
      .set({ completedAt: daysBefore(1) })
      .where(eq(schema.enrollments.userId, base.user.id))
      .run();
    db.insert(schema.videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId,
        eventType: "progress",
        positionSeconds: 590,
        createdAt: daysBefore(1),
      })
      .run();

    const directory = mkdtempSync(join(tmpdir(), "notifications-outbox-"));
    const injected = (n: Parameters<typeof notify>[0]) =>
      notify(n, outboxTransport(directory));

    await runNotificationsJob(db, NOW, injected);
    expect(readdirSync(directory)).toHaveLength(0);
  });

  it("fires team-progress course-completed to the Team Admin when a Team Licence Enrollment is marked completed", async () => {
    // Make base.user a seat-holder: seed team + admin + claimed coupon.
    const admin = db
      .insert(schema.users)
      .values({
        name: "Admin Ada",
        email: "ada@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();
    const team = db.insert(schema.teams).values({}).returning().get();
    db.insert(schema.teamMembers)
      .values({
        teamId: team.id,
        userId: admin.id,
        role: schema.TeamMemberRole.Admin,
      })
      .run();
    const purchase = db
      .insert(schema.purchases)
      .values({ userId: admin.id, courseId: base.course.id, amountPaid: 7900 })
      .returning()
      .get();
    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: "SEAT-X",
        purchaseId: purchase.id,
        redeemedByUserId: base.user.id,
        redeemedAt: daysBefore(2),
      })
      .run();

    // The new team-progress trigger: enrollment transitions to completed.
    db.update(schema.enrollments)
      .set({ completedAt: daysBefore(1) })
      .where(eq(schema.enrollments.userId, base.user.id))
      .run();

    const directory = mkdtempSync(join(tmpdir(), "notifications-outbox-"));
    const injected = (n: Parameters<typeof notify>[0]) =>
      notify(n, outboxTransport(directory));

    await runNotificationsJob(db, NOW, injected);

    const files = readdirSync(directory);
    const teamFiles = files.filter((f) => f.includes("team-progress"));
    expect(teamFiles).toHaveLength(1);
    const written = JSON.parse(readFileSync(join(directory, teamFiles[0]), "utf8"));
    expect(written).toMatchObject({
      subscriberId: String(admin.id),
      category: "team-progress",
      payload: {
        studentName: base.user.name,
        studentId: base.user.id,
        courseTitle: base.course.title,
        watermark: "course-completed",
      },
    });

    // Idempotent on re-run.
    await runNotificationsJob(db, NOW, injected);
    expect(
      readdirSync(directory).filter((f) => f.includes("team-progress"))
    ).toHaveLength(1);
  });

  it("does not fire team-progress course-completed while the Enrollment is still in progress, even past 80% watched", async () => {
    db.update(schema.lessons)
      .set({ durationMinutes: 10 })
      .where(eq(schema.lessons.id, lessonId))
      .run();

    const admin = db
      .insert(schema.users)
      .values({
        name: "Admin Ada",
        email: "ada2@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();
    const team = db.insert(schema.teams).values({}).returning().get();
    db.insert(schema.teamMembers)
      .values({
        teamId: team.id,
        userId: admin.id,
        role: schema.TeamMemberRole.Admin,
      })
      .run();
    const purchase = db
      .insert(schema.purchases)
      .values({ userId: admin.id, courseId: base.course.id, amountPaid: 7900 })
      .returning()
      .get();
    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: "SEAT-Y",
        purchaseId: purchase.id,
        redeemedByUserId: base.user.id,
        redeemedAt: daysBefore(2),
      })
      .run();

    // 500/600 watched → completion nudge fires, but no completedAt on the
    // enrollment → no team-progress fan-out (that's decoupled now).
    db.insert(schema.videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId,
        eventType: "progress",
        positionSeconds: 500,
        createdAt: daysBefore(1),
      })
      .run();

    const directory = mkdtempSync(join(tmpdir(), "notifications-outbox-"));
    const injected = (n: Parameters<typeof notify>[0]) =>
      notify(n, outboxTransport(directory));

    await runNotificationsJob(db, NOW, injected);

    const files = readdirSync(directory);
    expect(files.some((f) => f.includes("completion"))).toBe(true);
    expect(files.some((f) => f.includes("team-progress"))).toBe(false);
  });

  it("re-engagement and completion scans coexist for separate enrollments", async () => {
    // The default enrollment is the re-engagement candidate: 30 days idle.
    db.insert(schema.videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId,
        eventType: "progress",
        positionSeconds: 10,
        createdAt: daysBefore(30),
      })
      .run();

    // A second user + course for the completion candidate.
    const user2 = db
      .insert(schema.users)
      .values({
        name: "Other",
        email: "other@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();
    const course2 = db
      .insert(schema.courses)
      .values({
        title: "Course Two",
        slug: "course-two",
        description: "x",
        salesCopy: "x",
        instructorId: base.instructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();
    const mod2 = db
      .insert(schema.modules)
      .values({ courseId: course2.id, title: "M", position: 1 })
      .returning()
      .get();
    const lesson2 = db
      .insert(schema.lessons)
      .values({
        moduleId: mod2.id,
        title: "L",
        position: 1,
        durationMinutes: 10,
      })
      .returning()
      .get();
    db.insert(schema.enrollments)
      .values({ userId: user2.id, courseId: course2.id })
      .run();
    db.insert(schema.videoWatchEvents)
      .values({
        userId: user2.id,
        lessonId: lesson2.id,
        eventType: "progress",
        positionSeconds: 550,
        createdAt: daysBefore(1),
      })
      .run();

    const directory = mkdtempSync(join(tmpdir(), "notifications-outbox-"));
    const injected = (n: Parameters<typeof notify>[0]) =>
      notify(n, outboxTransport(directory));

    await runNotificationsJob(db, NOW, injected);

    const files = readdirSync(directory);
    expect(files.some((f) => f.includes("re-engagement"))).toBe(true);
    expect(files.some((f) => f.includes("completion"))).toBe(true);
    expect(files).toHaveLength(2);
  });
});
