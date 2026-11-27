import { and, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import { db as defaultDb } from "~/db";
import * as schema from "~/db/schema";
import { notify as defaultNotify } from "~/lib/notifier.server";
import type { Notification, NotificationCategory } from "~/lib/notifier.server";
import { getTeamAdminId } from "~/lib/teams.server";

// ─── Re-engagement nudge ───
// Fires once per Enrollment per inactivity-threshold crossing. The idempotency
// key is derived from the learner's last-activity date (the latest
// videoWatchEvent createdAt, or enrolledAt if no events exist). A learner who
// crosses the threshold at a given last-activity date gets exactly one nudge;
// a second nudge only fires if they come back (new activity → new
// lastActivityIso bucket) and lapse again. This replaces the previous
// ISO-week scheme, which would have fired weekly on an unchanging state.
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

type SentKey = {
  subscriberId: string;
  category: NotificationCategory;
  idempotencyKey: string;
};

/** Has a notification with this (subscriberId, category, key) already been sent? */
function hasBeenSent(db: DB, key: SentKey): boolean {
  const existing = db
    .select({ id: schema.notificationsSent.id })
    .from(schema.notificationsSent)
    .where(
      and(
        eq(schema.notificationsSent.subscriberId, key.subscriberId),
        eq(schema.notificationsSent.category, key.category),
        eq(schema.notificationsSent.idempotencyKey, key.idempotencyKey)
      )
    )
    .get();
  return !!existing;
}

/** Record that a notification was emitted for (subscriberId, category, key). */
function recordSent(db: DB, key: SentKey, sentAt: Date): void {
  db.insert(schema.notificationsSent)
    .values({
      subscriberId: key.subscriberId,
      category: key.category,
      idempotencyKey: key.idempotencyKey,
      sentAt: sentAt.toISOString(),
    })
    .run();
}

export async function runNotificationsJob(
  db: DB,
  now: Date,
  notify: NotifyFn = defaultNotify
): Promise<void> {
  await emitReengagementNudges(db, now, notify);
  await emitCompletionNudges(db, now, notify);
  await emitTeamProgressCourseCompleted(db, now, notify);
}

function selectReengagementRows(db: DB) {
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

  return db
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
}

async function emitReengagementNudges(
  db: DB,
  now: Date,
  notify: NotifyFn
): Promise<void> {
  const cutoff = new Date(
    now.getTime() - INACTIVITY_THRESHOLD_DAYS * 86_400_000
  ).toISOString();

  for (const row of selectReengagementRows(db)) {
    // Use last watch event if present, else fall back to enrolledAt — a
    // learner who enrolled and never watched is also a candidate.
    const lastActive = row.lastWatchedAt ?? row.enrolledAt;
    if (lastActive >= cutoff) continue;

    const subscriberId = String(row.userId);
    // Crossing-based idempotency: enrollment + learner's last-activity day.
    // A second nudge only fires if they come back (new activity → new
    // lastActivityIso), lapse again, and push a fresh bucket. Spec #12.
    const key: SentKey = {
      subscriberId,
      category: "re-engagement",
      idempotencyKey: `crossing:${row.enrollmentId}:${lastActive.slice(0, 10)}`,
    };
    if (hasBeenSent(db, key)) continue;

    await notify({
      subscriberId,
      category: "re-engagement",
      payload: {
        courseTitle: row.courseTitle,
        courseUrl: `/courses/${row.courseSlug}`,
      },
    });

    recordSent(db, key, now);
  }
}

type CompletionEnrollmentRow = {
  enrollmentId: number;
  userId: number;
  courseId: number;
  courseTitle: string;
  courseSlug: string;
};

/**
 * Returns [watchedSeconds, totalSeconds] for the enrollment, or null when the
 * course has no measurable duration (no lessons, or no durationMinutes set).
 */
function getWatchProgress(
  db: DB,
  row: CompletionEnrollmentRow
): { watchedSeconds: number; totalSeconds: number } | null {
  const lessonIds = db
    .select({ id: schema.lessons.id })
    .from(schema.lessons)
    .innerJoin(schema.modules, eq(schema.lessons.moduleId, schema.modules.id))
    .where(eq(schema.modules.courseId, row.courseId))
    .all()
    .map((r) => r.id);
  if (lessonIds.length === 0) return null;

  const durationRow = db
    .select({
      total: sql<number>`coalesce(sum(${schema.lessons.durationMinutes}), 0)`,
    })
    .from(schema.lessons)
    .where(inArray(schema.lessons.id, lessonIds))
    .get();
  const totalSeconds = (durationRow?.total ?? 0) * 60;
  if (totalSeconds <= 0) return null;

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

  return { watchedSeconds, totalSeconds };
}

async function emitCompletionNudges(
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
    const progress = getWatchProgress(db, row);
    if (!progress) continue;
    const { watchedSeconds, totalSeconds } = progress;
    if (watchedSeconds / totalSeconds < NEAR_COMPLETION_RATIO) continue;

    const subscriberId = String(row.userId);
    // Enrollment-scoped idempotency: one completion nudge per enrollment, ever.
    const key: SentKey = {
      subscriberId,
      category: "completion",
      idempotencyKey: `enrollment:${row.enrollmentId}`,
    };
    if (hasBeenSent(db, key)) continue;

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

    recordSent(db, key, now);
  }
}

// Team-progress fan-out for the "course-completed" watermark. Spec #12 /
// ticket #20: fire when a Student's Enrollment on a Team Licence transitions
// to completed — i.e. `enrollments.completedAt` is set — independently of
// the learner's own completion nudge (which reacts to video-seconds). We
// scan completed enrollments and dedup per-enrollment.
type CompletedEnrollmentRow = {
  enrollmentId: number;
  userId: number;
  courseId: number;
  courseTitle: string;
};

/** Returns the Team Admin to notify for this completed enrollment, or null. */
function findTeamAdminForCompletion(
  db: DB,
  row: CompletedEnrollmentRow
): number | null {
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
  if (!seat) return null;

  const adminId = getTeamAdminId(db, seat.teamId);
  if (adminId === null || adminId === row.userId) return null;
  return adminId;
}

async function emitTeamProgressCourseCompleted(
  db: DB,
  now: Date,
  notify: NotifyFn
): Promise<void> {
  const completed = db
    .select({
      enrollmentId: schema.enrollments.id,
      userId: schema.enrollments.userId,
      courseId: schema.enrollments.courseId,
      courseTitle: schema.courses.title,
    })
    .from(schema.enrollments)
    .innerJoin(
      schema.courses,
      eq(schema.courses.id, schema.enrollments.courseId)
    )
    .where(isNotNull(schema.enrollments.completedAt))
    .all();

  for (const row of completed) {
    const adminId = findTeamAdminForCompletion(db, row);
    if (adminId === null) continue;

    const subscriberId = String(adminId);
    const key: SentKey = {
      subscriberId,
      category: "team-progress",
      idempotencyKey: `team-progress:enrollment:${row.enrollmentId}:course-completed`,
    };
    if (hasBeenSent(db, key)) continue;

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

    recordSent(db, key, now);
  }
}

// ─── CLI entry ───
// Invoked by `npm run job:notifications`. In production this would be fired
// by cron / a scheduled worker; for now operators run it manually or wire the
// npm script into whichever scheduler they use.
if (import.meta.url === `file://${process.argv[1]}`) {
  runNotificationsJob(defaultDb, new Date())
    .then(() => {
      // eslint-disable-next-line no-console -- CLI entry point success log
      console.log("notifications job: done");
    })
    .catch((error) => {
      console.error("notifications job failed:", error);
      process.exit(1);
    });
}
