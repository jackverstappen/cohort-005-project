import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  comments,
  coupons,
  courses,
  courseRatings,
  lessons,
  lessonProgress,
  LessonProgressStatus,
  modules,
  purchases,
  quizAttempts,
  quizzes,
  refunds,
  RefundStatus,
  users,
  videoWatchEvents,
} from "~/db/schema";

export type PriorRefundRow = {
  id: number;
  status: RefundStatus;
  reason: string;
  requestedAt: string;
  resolvedAt: string | null;
  amountRefunded: number | null;
  courseId: number;
  courseTitle: string;
};

export type PriorRefundGroup = {
  courseId: number;
  courseTitle: string;
  isCurrentCourse: boolean;
  refunds: Array<Omit<PriorRefundRow, "courseId" | "courseTitle">>;
};

export function groupPriorRefundsByCourse(
  rows: PriorRefundRow[],
  currentCourseId: number
): PriorRefundGroup[] {
  const byCourse = new Map<number, PriorRefundGroup>();

  for (const row of rows) {
    let group = byCourse.get(row.courseId);
    if (!group) {
      group = {
        courseId: row.courseId,
        courseTitle: row.courseTitle,
        isCurrentCourse: row.courseId === currentCourseId,
        refunds: [],
      };
      byCourse.set(row.courseId, group);
    }
    group.refunds.push({
      id: row.id,
      status: row.status,
      reason: row.reason,
      requestedAt: row.requestedAt,
      resolvedAt: row.resolvedAt,
      amountRefunded: row.amountRefunded,
    });
  }

  // Current course first, then by most recent request in group.
  return [...byCourse.values()].sort((a, b) => {
    if (a.isCurrentCourse !== b.isCurrentCourse) {
      return a.isCurrentCourse ? -1 : 1;
    }
    const aLatest = a.refunds[0]?.requestedAt ?? "";
    const bLatest = b.refunds[0]?.requestedAt ?? "";
    return bLatest.localeCompare(aLatest);
  });
}

export type TeamSeatHistory = {
  code: string;
  claimant: { id: number; name: string; email: string } | null;
  claimedAt: string | null;
  lessonsCompleted: number;
  watchedHours: number;
  lastActivityAt: string | null;
};

export type AdminRefundView = {
  refund: {
    id: number;
    status: RefundStatus;
    reason: string;
    requestedAt: string;
    resolvedAt: string | null;
    resolvedByName: string | null;
    amountRefunded: number | null;
  };
  snapshot: {
    watchedHours: number;
    daysSincePurchase: number;
    seatsClaimed: number;
  };
  purchase: {
    id: number;
    amountPaid: number;
    country: string | null;
    createdAt: string;
  };
  course: { id: number; title: string; slug: string };
  student: { id: number; name: string; email: string };
  history: {
    rating: number | null;
    lessonsCompleted: number;
    totalLessons: number;
    quizAttempts: number;
    quizzesPassed: number;
    commentCount: number;
    lastActivityAt: string | null;
    currentWatchedHours: number;
    fromRefundedPurchase: boolean;
    priorApprovedRefundsAcrossAllCourses: number;
  };
  teamSeats: TeamSeatHistory[] | null;
  priorRefunds: PriorRefundGroup[];
};

function maxIso(...values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  for (const v of values) {
    if (!v) continue;
    if (latest === null || v > latest) latest = v;
  }
  return latest;
}

function lessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function userWatchHoursAcross(userId: number, lessonIds: number[]): number {
  if (lessonIds.length === 0) return 0;
  const furthest = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();
  const seconds = furthest.reduce((t, r) => t + (r.furthest ?? 0), 0);
  return seconds / 3600;
}

function userLastActivity(userId: number, lessonIds: number[]): string | null {
  if (lessonIds.length === 0) return null;
  const lastProgress = db
    .select({ at: sql<string>`max(${lessonProgress.completedAt})` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get()?.at ?? null;

  const lastWatch = db
    .select({ at: sql<string>`max(${videoWatchEvents.createdAt})` })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .get()?.at ?? null;

  const lastComment = db
    .select({ at: sql<string>`max(${comments.createdAt})` })
    .from(comments)
    .where(
      and(
        eq(comments.userId, userId),
        inArray(comments.lessonId, lessonIds)
      )
    )
    .get()?.at ?? null;

  const lastQuiz = db
    .select({ at: sql<string>`max(${quizAttempts.attemptedAt})` })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .where(
      and(
        eq(quizAttempts.userId, userId),
        inArray(quizzes.lessonId, lessonIds)
      )
    )
    .get()?.at ?? null;

  return maxIso(lastProgress, lastWatch, lastComment, lastQuiz);
}

function userLessonsCompleted(userId: number, lessonIds: number[]): number {
  if (lessonIds.length === 0) return 0;
  return db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        inArray(lessonProgress.lessonId, lessonIds),
        eq(lessonProgress.status, LessonProgressStatus.Completed)
      )
    )
    .get()?.count ?? 0;
}

export function getRefundForAdmin(refundId: number): AdminRefundView | null {
  const row = db
    .select({
      refund: refunds,
      purchase: purchases,
      course: courses,
      student: users,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(eq(refunds.id, refundId))
    .get();

  if (!row) return null;

  const resolvedBy = row.refund.resolvedByUserId
    ? db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, row.refund.resolvedByUserId))
        .get()
    : null;

  const courseLessonIds = lessonIdsForCourse(row.course.id);
  const totalLessons = courseLessonIds.length;

  const lessonsCompleted = userLessonsCompleted(row.student.id, courseLessonIds);

  const quizStats = db
    .select({
      attempts: sql<number>`count(*)`,
      passed: sql<number>`sum(case when ${quizAttempts.passed} = 1 then 1 else 0 end)`,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .where(
      and(
        eq(quizAttempts.userId, row.student.id),
        inArray(quizzes.lessonId, courseLessonIds.length > 0 ? courseLessonIds : [-1])
      )
    )
    .get();

  const ratingRow = db
    .select({ rating: courseRatings.rating })
    .from(courseRatings)
    .where(
      and(
        eq(courseRatings.userId, row.student.id),
        eq(courseRatings.courseId, row.course.id)
      )
    )
    .get();

  const commentCount = courseLessonIds.length === 0
    ? 0
    : db
        .select({ count: sql<number>`count(*)` })
        .from(comments)
        .where(
          and(
            eq(comments.userId, row.student.id),
            inArray(comments.lessonId, courseLessonIds)
          )
        )
        .get()?.count ?? 0;

  const lastActivityAt = userLastActivity(row.student.id, courseLessonIds);

  // "from a refunded purchase": any prior Approved refund on this course by
  // this student. Signals that any engagement history shown below may be
  // leftover from an earlier, refunded purchase.
  const priorApprovedSameCourse = db
    .select({ id: refunds.id })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .where(
      and(
        eq(purchases.userId, row.student.id),
        eq(purchases.courseId, row.course.id),
        eq(refunds.status, RefundStatus.Approved)
      )
    )
    .get();

  const priorApprovedRefundsAcrossAllCourses = db
    .select({ count: sql<number>`count(*)` })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .where(
      and(
        eq(purchases.userId, row.student.id),
        eq(refunds.status, RefundStatus.Approved)
      )
    )
    .get()?.count ?? 0;

  const currentWatchedHours = userWatchHoursAcross(
    row.student.id,
    courseLessonIds
  );

  // Prior refunds across all courses by this student, excluding the current one.
  const priorRows = db
    .select({
      id: refunds.id,
      status: refunds.status,
      reason: refunds.reason,
      requestedAt: refunds.requestedAt,
      resolvedAt: refunds.resolvedAt,
      amountRefunded: refunds.amountRefunded,
      courseId: courses.id,
      courseTitle: courses.title,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(purchases.userId, row.student.id))
    .orderBy(desc(refunds.requestedAt))
    .all()
    .filter((r) => r.id !== row.refund.id);

  const priorRefunds = groupPriorRefundsByCourse(priorRows, row.course.id);

  // Team Licence: does this purchase have any coupons?
  const seatRows = db
    .select({
      code: coupons.code,
      redeemedAt: coupons.redeemedAt,
      claimant: users,
    })
    .from(coupons)
    .leftJoin(users, eq(coupons.redeemedByUserId, users.id))
    .where(eq(coupons.purchaseId, row.purchase.id))
    .all();

  const teamSeats: TeamSeatHistory[] | null =
    seatRows.length === 0
      ? null
      : seatRows.map((seat) => {
          const claimant = seat.claimant;
          if (!claimant) {
            return {
              code: seat.code,
              claimant: null,
              claimedAt: seat.redeemedAt,
              lessonsCompleted: 0,
              watchedHours: 0,
              lastActivityAt: null,
            };
          }
          return {
            code: seat.code,
            claimant: {
              id: claimant.id,
              name: claimant.name,
              email: claimant.email,
            },
            claimedAt: seat.redeemedAt,
            lessonsCompleted: userLessonsCompleted(claimant.id, courseLessonIds),
            watchedHours: userWatchHoursAcross(claimant.id, courseLessonIds),
            lastActivityAt: userLastActivity(claimant.id, courseLessonIds),
          };
        });

  const fromRefundedPurchase = !!priorApprovedSameCourse;

  return {
    refund: {
      id: row.refund.id,
      status: row.refund.status,
      reason: row.refund.reason,
      requestedAt: row.refund.requestedAt,
      resolvedAt: row.refund.resolvedAt,
      resolvedByName: resolvedBy?.name ?? null,
      amountRefunded: row.refund.amountRefunded,
    },
    snapshot: {
      watchedHours: row.refund.watchedHoursAtRequest,
      daysSincePurchase: row.refund.daysSincePurchaseAtRequest,
      seatsClaimed: row.refund.seatsClaimedAtRequest,
    },
    purchase: {
      id: row.purchase.id,
      amountPaid: row.purchase.amountPaid,
      country: row.purchase.country,
      createdAt: row.purchase.createdAt,
    },
    course: { id: row.course.id, title: row.course.title, slug: row.course.slug },
    student: {
      id: row.student.id,
      name: row.student.name,
      email: row.student.email,
    },
    history: {
      rating: ratingRow?.rating ?? null,
      lessonsCompleted,
      totalLessons,
      quizAttempts: Number(quizStats?.attempts ?? 0),
      quizzesPassed: Number(quizStats?.passed ?? 0),
      commentCount,
      lastActivityAt,
      currentWatchedHours,
      fromRefundedPurchase,
      priorApprovedRefundsAcrossAllCourses: Number(
        priorApprovedRefundsAcrossAllCourses
      ),
    },
    teamSeats,
    priorRefunds,
  };
}

export type RefundListRow = {
  id: number;
  requestedAt: string;
  reason: string;
  studentName: string;
  courseTitle: string;
  watchedHoursAtRequest: number;
  daysSincePurchaseAtRequest: number;
  seatsClaimedAtRequest: number;
};

export function listOpenRefunds(): RefundListRow[] {
  return db
    .select({
      id: refunds.id,
      requestedAt: refunds.requestedAt,
      reason: refunds.reason,
      studentName: users.name,
      courseTitle: courses.title,
      watchedHoursAtRequest: refunds.watchedHoursAtRequest,
      daysSincePurchaseAtRequest: refunds.daysSincePurchaseAtRequest,
      seatsClaimedAtRequest: refunds.seatsClaimedAtRequest,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(eq(refunds.status, RefundStatus.Open))
    .orderBy(desc(refunds.requestedAt))
    .all();
}

export type ResolveInput = {
  refundId: number;
  decidedByUserId: number;
  decision: "approve" | "decline";
};

export function resolveRefund({ refundId, decidedByUserId, decision }: ResolveInput) {
  const existing = db
    .select({ refund: refunds, purchase: purchases })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .where(eq(refunds.id, refundId))
    .get();

  if (!existing) return { ok: false as const, error: "not-found" as const };
  if (existing.refund.status !== RefundStatus.Open) {
    return { ok: false as const, error: "not-open" as const };
  }

  const nowIso = new Date().toISOString();
  const nextStatus =
    decision === "approve" ? RefundStatus.Approved : RefundStatus.Declined;

  db.update(refunds)
    .set({
      status: nextStatus,
      resolvedAt: nowIso,
      resolvedByUserId: decidedByUserId,
      amountRefunded: decision === "approve" ? existing.purchase.amountPaid : null,
    })
    .where(eq(refunds.id, refundId))
    .run();

  return { ok: true as const };
}
