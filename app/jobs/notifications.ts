import { and, eq, inArray, max, sql } from "drizzle-orm";
import { db as defaultDb } from "~/db";
import * as schema from "~/db/schema";
import { notify as defaultNotify } from "~/lib/notifier.server";
import type { Notification } from "~/lib/notifier.server";

// ─── Re-engagement nudge ───
// Fires once per Enrollment per lapse-window crossing. A learner whose latest
// Watched activity is older than this threshold gets one re-engagement
// notification per ISO-week — re-running the job within the same week is a
// no-op, and a fresh week with no activity triggers a fresh nudge.

export const INACTIVITY_THRESHOLD_DAYS = 7;

// ─── Completion nudge ───
// Fires once per Enrollment, ever: when the learner's watched seconds first
// crosses NEAR_COMPLETION_RATIO of the course's total watchable seconds we
// send one "you're nearly done" notification, then never again for that
// enrollment. A single enrollment-scoped idempotency key gives the spec's
// "once per crossing" without book-keeping buckets: once the row exists in
// notifications_sent, further ratio climbs do nothing.
export const NEAR_COMPLETION_RATIO = 0.8;

type DB = typeof defaultDb;
type NotifyFn = (notification: Notification) => Promise<void>;

/** ISO-week-numbering year and week — e.g. 2026-W47. */
function isoWeekKey(date: Date): string {
  // Copy, shift to Thursday of the current ISO week (Mon=1 … Sun=7).
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export async function runNotificationsJob(
  db: DB,
  now: Date,
  notify: NotifyFn = defaultNotify
): Promise<void> {
  const cutoff = new Date(
    now.getTime() - INACTIVITY_THRESHOLD_DAYS * 86_400_000
  ).toISOString();

  // Enrollments with their latest watch-event timestamp (if any), joined to
  // the course for payload. completedAt enrollments are skipped.
  const lastActivity = db
    .select({
      userId: schema.videoWatchEvents.userId,
      lessonId: schema.videoWatchEvents.lessonId,
      lastAt: max(schema.videoWatchEvents.createdAt).as("last_at"),
    })
    .from(schema.videoWatchEvents)
    .groupBy(schema.videoWatchEvents.userId, schema.videoWatchEvents.lessonId)
    .as("last_activity");

  // Per-enrollment latest activity across all lessons of that course.
  const rows = db
    .select({
      enrollmentId: schema.enrollments.id,
      userId: schema.enrollments.userId,
      courseId: schema.courses.id,
      courseTitle: schema.courses.title,
      courseSlug: schema.courses.slug,
      enrolledAt: schema.enrollments.enrolledAt,
      lastWatchedAt: sql<string | null>`max(${lastActivity.lastAt})`.as(
        "last_watched_at"
      ),
    })
    .from(schema.enrollments)
    .innerJoin(
      schema.courses,
      eq(schema.courses.id, schema.enrollments.courseId)
    )
    .leftJoin(
      schema.modules,
      eq(schema.modules.courseId, schema.enrollments.courseId)
    )
    .leftJoin(schema.lessons, eq(schema.lessons.moduleId, schema.modules.id))
    .leftJoin(
      lastActivity,
      and(
        eq(lastActivity.userId, schema.enrollments.userId),
        eq(lastActivity.lessonId, schema.lessons.id)
      )
    )
    .where(sql`${schema.enrollments.completedAt} is null`)
    .groupBy(schema.enrollments.id)
    .all();

  const idempotencyKey = isoWeekKey(now);

  for (const row of rows) {
    // Use last watch event if present, else fall back to enrolledAt — a
    // learner who enrolled and never watched is also a candidate.
    const lastActive = row.lastWatchedAt ?? row.enrolledAt;
    if (lastActive >= cutoff) continue;

    const subscriberId = String(row.userId);

    // Skip if already notified for this lapse-window crossing.
    const existing = db
      .select({ id: schema.notificationsSent.id })
      .from(schema.notificationsSent)
      .where(
        and(
          eq(schema.notificationsSent.subscriberId, subscriberId),
          eq(schema.notificationsSent.category, "re-engagement"),
          eq(schema.notificationsSent.idempotencyKey, idempotencyKey)
        )
      )
      .get();
    if (existing) continue;

    await notify({
      subscriberId,
      category: "re-engagement",
      payload: {
        courseTitle: row.courseTitle,
        courseUrl: `/courses/${row.courseSlug}`,
      },
    });

    db.insert(schema.notificationsSent)
      .values({
        subscriberId,
        category: "re-engagement",
        idempotencyKey,
        sentAt: now.toISOString(),
      })
      .run();
  }

  await scanCompletionCandidates(db, now, notify);
}

async function scanCompletionCandidates(
  db: DB,
  now: Date,
  notify: NotifyFn
): Promise<void> {
  const enrollments = db
    .select({
      enrollmentId: schema.enrollments.id,
      userId: schema.enrollments.userId,
      courseId: schema.courses.id,
      courseTitle: schema.courses.title,
      courseSlug: schema.courses.slug,
    })
    .from(schema.enrollments)
    .innerJoin(
      schema.courses,
      eq(schema.courses.id, schema.enrollments.courseId)
    )
    .where(sql`${schema.enrollments.completedAt} is null`)
    .all();

  for (const row of enrollments) {
    // Total watchable seconds for the course — sum(durationMinutes) across
    // all lessons in all modules of the course. Treated as seconds via *60.
    // A course with no durations defined can't be measured, so skip it.
    const lessonIds = db
      .select({ id: schema.lessons.id })
      .from(schema.lessons)
      .innerJoin(
        schema.modules,
        eq(schema.lessons.moduleId, schema.modules.id)
      )
      .where(eq(schema.modules.courseId, row.courseId))
      .all()
      .map((r) => r.id);

    if (lessonIds.length === 0) continue;

    const durationRow = db
      .select({
        total: sql<number>`coalesce(sum(${schema.lessons.durationMinutes}), 0)`,
      })
      .from(schema.lessons)
      .where(inArray(schema.lessons.id, lessonIds))
      .get();
    const totalSeconds = (durationRow?.total ?? 0) * 60;
    if (totalSeconds <= 0) continue;

    const furthestPerLesson = db
      .select({
        furthest: sql<number>`max(${schema.videoWatchEvents.positionSeconds})`,
      })
      .from(schema.videoWatchEvents)
      .where(
        and(
          eq(schema.videoWatchEvents.userId, row.userId),
          inArray(schema.videoWatchEvents.lessonId, lessonIds)
        )
      )
      .groupBy(schema.videoWatchEvents.lessonId)
      .all();
    const watchedSeconds = furthestPerLesson.reduce(
      (total, r) => total + (r.furthest ?? 0),
      0
    );

    if (watchedSeconds / totalSeconds < NEAR_COMPLETION_RATIO) continue;

    const subscriberId = String(row.userId);
    // Enrollment-scoped idempotency: one completion nudge per enrollment, ever.
    const idempotencyKey = `enrollment:${row.enrollmentId}`;

    const existing = db
      .select({ id: schema.notificationsSent.id })
      .from(schema.notificationsSent)
      .where(
        and(
          eq(schema.notificationsSent.subscriberId, subscriberId),
          eq(schema.notificationsSent.category, "completion"),
          eq(schema.notificationsSent.idempotencyKey, idempotencyKey)
        )
      )
      .get();
    if (existing) continue;

    await notify({
      subscriberId,
      category: "completion",
      payload: {
        courseTitle: row.courseTitle,
        courseUrl: `/courses/${row.courseSlug}`,
        watchedSeconds,
        totalSeconds,
      },
    });

    db.insert(schema.notificationsSent)
      .values({
        subscriberId,
        category: "completion",
        idempotencyKey,
        sentAt: now.toISOString(),
      })
      .run();

    // Team-progress: if this learner holds a claimed Seat on a Team Licence
    // for this course, also tell the Team Admin the course was completed.
    await emitTeamProgressCourseCompleted(db, now, notify, {
      enrollmentId: row.enrollmentId,
      userId: row.userId,
      courseId: row.courseId,
      courseTitle: row.courseTitle,
    });
  }
}

async function emitTeamProgressCourseCompleted(
  db: DB,
  now: Date,
  notify: NotifyFn,
  row: {
    enrollmentId: number;
    userId: number;
    courseId: number;
    courseTitle: string;
  }
): Promise<void> {
  const seat = db
    .select({ teamId: schema.coupons.teamId })
    .from(schema.coupons)
    .where(
      and(
        eq(schema.coupons.redeemedByUserId, row.userId),
        eq(schema.coupons.courseId, row.courseId)
      )
    )
    .get();
  if (!seat) return;

  const admin = db
    .select({ userId: schema.teamMembers.userId })
    .from(schema.teamMembers)
    .where(
      and(
        eq(schema.teamMembers.teamId, seat.teamId),
        eq(schema.teamMembers.role, schema.TeamMemberRole.Admin)
      )
    )
    .get();
  if (!admin || admin.userId === row.userId) return;

  const subscriberId = String(admin.userId);
  const idempotencyKey = `enrollment:${row.enrollmentId}:course-completed`;

  const existing = db
    .select({ id: schema.notificationsSent.id })
    .from(schema.notificationsSent)
    .where(
      and(
        eq(schema.notificationsSent.subscriberId, subscriberId),
        eq(schema.notificationsSent.category, "team-progress"),
        eq(schema.notificationsSent.idempotencyKey, idempotencyKey)
      )
    )
    .get();
  if (existing) return;

  const student = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, row.userId))
    .get();

  await notify({
    subscriberId,
    category: "team-progress",
    payload: {
      studentName: student?.name ?? "",
      studentId: row.userId,
      courseTitle: row.courseTitle,
      watermark: "course-completed",
    },
  });

  db.insert(schema.notificationsSent)
    .values({
      subscriberId,
      category: "team-progress",
      idempotencyKey,
      sentAt: now.toISOString(),
    })
    .run();
}

// ─── CLI entry ───
// Invoked by `npm run job:notifications`. In production this would be fired
// by cron / a scheduled worker; for now operators run it manually or wire the
// npm script into whichever scheduler they use.
if (import.meta.url === `file://${process.argv[1]}`) {
  runNotificationsJob(defaultDb, new Date())
    .then(() => {
      console.log("notifications job: done");
    })
    .catch((error) => {
      console.error("notifications job failed:", error);
      process.exit(1);
    });
}
