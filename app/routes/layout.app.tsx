import { Outlet } from "react-router";
import { useEffect, useRef } from "react";
import { NovuProvider, useNovu } from "@novu/react";
import { toast, Toaster } from "sonner";
import type { Route } from "./+types/layout.app";
import { Sidebar } from "~/components/sidebar";
import { DevUI } from "~/components/dev-ui";
import { getCurrentUserId, getDevCountry } from "~/lib/session";
import { signSubscriber } from "~/lib/novu.server";
import { getCountryTierInfo, COUNTRIES } from "~/lib/ppp";
import { eq, and, or, sql, desc } from "drizzle-orm";
import { db } from "~/db";
import {
  users,
  courses,
  modules,
  lessons,
  lessonProgress,
  teams,
  teamMembers,
  TeamMemberRole,
  LessonProgressStatus,
} from "~/db/schema";

function getAllUsers() {
  return db.select().from(users).all();
}

function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

function getTeamForAdmin(userId: number) {
  const membership = db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();

  if (!membership) return undefined;

  return db.select().from(teams).where(eq(teams.id, membership.teamId)).get();
}

function isTeamAdmin(userId: number) {
  return !!getTeamForAdmin(userId);
}

function getCourseLessonIds(courseId: number): number[] {
  const courseModules = db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .all();

  if (courseModules.length === 0) return [];

  const courseLessons = db
    .select({ id: lessons.id })
    .from(lessons)
    .where(or(...courseModules.map((m) => eq(lessons.moduleId, m.id))))
    .all();

  return courseLessons.map((l) => l.id);
}

function calculateProgress(
  userId: number,
  courseId: number,
  weightByDuration: boolean
) {
  const lessonIds = getCourseLessonIds(courseId);

  if (lessonIds.length === 0) return 0;

  if (weightByDuration) {
    const courseLessons = db
      .select({
        id: lessons.id,
        durationMinutes: lessons.durationMinutes,
      })
      .from(lessons)
      .where(or(...lessonIds.map((id) => eq(lessons.id, id))))
      .all();

    const totalDuration = courseLessons.reduce(
      (sum, l) => sum + (l.durationMinutes ?? 1),
      0
    );

    if (totalDuration === 0) return 0;

    const completed = db
      .select()
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.status, LessonProgressStatus.Completed),
          or(...lessonIds.map((id) => eq(lessonProgress.lessonId, id)))
        )
      )
      .all();

    const completedIds = new Set(completed.map((p) => p.lessonId));

    const completedDuration = courseLessons
      .filter((l) => completedIds.has(l.id))
      .reduce((sum, l) => sum + (l.durationMinutes ?? 1), 0);

    return Math.round((completedDuration / totalDuration) * 100);
  }

  const completedCount = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        or(...lessonIds.map((id) => eq(lessonProgress.lessonId, id)))
      )
    )
    .get();

  return Math.round(((completedCount?.count ?? 0) / lessonIds.length) * 100);
}

function getCompletedLessonCount(userId: number, courseId: number) {
  const lessonIds = getCourseLessonIds(courseId);
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        or(...lessonIds.map((id) => eq(lessonProgress.lessonId, id)))
      )
    )
    .get();

  return result?.count ?? 0;
}

function getTotalLessonCount(courseId: number) {
  return getCourseLessonIds(courseId).length;
}

function getRecentlyProgressedCourses(userId: number, limit = 3) {
  return db
    .select({
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      coverImageUrl: courses.coverImageUrl,
      lastActivityId: sql<number>`max(${lessonProgress.id})`,
    })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessonProgress.userId, userId))
    .groupBy(courses.id)
    .orderBy(desc(sql`max(${lessonProgress.id})`))
    .limit(limit)
    .all();
}

export async function loader({ request }: Route.LoaderArgs) {
  const users = getAllUsers();
  const currentUserId = await getCurrentUserId(request);
  const currentUser = currentUserId ? getUserById(currentUserId) : null;
  const devCountry = await getDevCountry(request);
  const countryTierInfo = getCountryTierInfo(devCountry);

  const recentCourses = currentUserId
    ? getRecentlyProgressedCourses(currentUserId).map((course) => {
        const completedLessons = getCompletedLessonCount(
          currentUserId,
          course.courseId
        );
        const totalLessons = getTotalLessonCount(course.courseId);
        const progress = calculateProgress(
          currentUserId,
          course.courseId,
          false
        );
        return {
          courseId: course.courseId,
          title: course.courseTitle,
          slug: course.courseSlug,
          coverImageUrl: course.coverImageUrl,
          completedLessons,
          totalLessons,
          progress,
        };
      })
    : [];

  const subscriberId = currentUserId ? String(currentUserId) : null;

  return {
    users: users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    currentUser: currentUser
      ? {
          id: currentUser.id,
          name: currentUser.name,
          role: currentUser.role,
          avatarUrl: currentUser.avatarUrl ?? null,
        }
      : null,
    recentCourses,
    devCountry,
    countryTierInfo,
    countries: COUNTRIES,
    isTeamAdmin: currentUserId ? isTeamAdmin(currentUserId) : false,
    novu: {
      subscriberId,
      subscriberHash: subscriberId ? signSubscriber(subscriberId) : undefined,
      applicationIdentifier: process.env.NOVU_APPLICATION_IDENTIFIER ?? "",
    },
  };
}

/**
 * Subscribes to Novu's real-time `notifications.notification_received` event
 * and fires a Sonner toast for each unread live arrival. The initial list
 * load does not pass through this handler — only genuine arrivals do.
 */
function NovuLiveToasts() {
  const novu = useNovu();
  const mountedAt = useRef<number | null>(null);

  useEffect(() => {
    mountedAt.current = Date.now();
    const off = novu.on("notifications.notification_received", (event) => {
      const n = event?.result;
      if (!n || n.isRead) return;
      // Guard against replays of history delivered just after mount.
      const createdMs = new Date(n.createdAt).getTime();
      if (
        mountedAt.current !== null &&
        !Number.isNaN(createdMs) &&
        createdMs < mountedAt.current
      ) {
        return;
      }
      toast(n.subject ?? n.body);
    });
    return () => {
      off();
    };
  }, [novu]);

  return null;
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const {
    users,
    currentUser,
    recentCourses,
    devCountry,
    countryTierInfo,
    countries,
    isTeamAdmin: userIsTeamAdmin,
    novu,
  } = loaderData;

  const layout = (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        currentUser={currentUser}
        recentCourses={recentCourses}
        isTeamAdmin={userIsTeamAdmin}
      />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <DevUI
        users={users}
        currentUser={currentUser}
        devCountry={devCountry}
        countryTierInfo={countryTierInfo}
        countries={countries}
      />
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );

  // Only wrap in NovuProvider when we have a signed-in user and an app id.
  // Without either, Novu's inbox cannot be identified; render layout as-is so
  // the (tiny) subset of unauthenticated paths through this layout still work.
  if (!novu.subscriberId || !novu.applicationIdentifier) return layout;

  return (
    <NovuProvider
      applicationIdentifier={novu.applicationIdentifier}
      subscriber={novu.subscriberId}
      subscriberHash={novu.subscriberHash}
    >
      <NovuLiveToasts />
      {layout}
    </NovuProvider>
  );
}
