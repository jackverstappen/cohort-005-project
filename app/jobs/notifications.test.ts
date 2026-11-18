import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
