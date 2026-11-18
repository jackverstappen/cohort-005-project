import { and, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { coupons, courses, purchases, users } from "~/db/schema";
import { notify as defaultNotify, type Notification } from "~/lib/notifier.server";
import { getTeamAdminId } from "~/lib/teams.server";

// ─── Seat grants ───
// A Team Admin grants a Seat (coupons row on a Team Licence) to a specific
// student by email. The grant marks an Unclaimed, un-granted Seat with a
// grantedToUserId and fires a seat-invite notification so the student knows a
// seat is waiting. Actual claiming still happens at /redeem/<code>.
//
// NOTE: the `seat-invite` Novu workflow is flagged critical (see spec #12 /
// ticket #13): the student cannot opt out of knowing they've been granted a
// seat.

export type Db = BetterSQLite3Database<typeof schema>;
type Notify = (notification: Notification) => Promise<void>;

export type GrantResult =
  | {
      ok: true;
      couponCode: string;
      invitedUserId: number;
      courseId: number;
    }
  | { ok: false; status: number; error: string };

/**
 * Grants an Unclaimed, un-granted Seat on `teamLicenceId` to the Student with
 * `studentEmail`. On success writes a seat-invite notification.
 */
export async function grantSeatToStudent(
  db: Db,
  teamLicenceId: number,
  studentEmail: string,
  teamAdminId: number,
  notify: Notify = defaultNotify
): Promise<GrantResult> {
  const email = studentEmail.trim().toLowerCase();
  if (email.length === 0) {
    return { ok: false, status: 400, error: "Give the student's email." };
  }

  const decided = db.transaction((tx): GrantResult => {
    const purchase = tx
      .select()
      .from(purchases)
      .where(eq(purchases.id, teamLicenceId))
      .get();
    if (!purchase) {
      return { ok: false, status: 404, error: "Team Licence not found." };
    }

    // Find a Seat on this Team Licence to establish the team.
    const anySeat = tx
      .select()
      .from(coupons)
      .where(eq(coupons.purchaseId, teamLicenceId))
      .get();
    if (!anySeat) {
      return {
        ok: false,
        status: 400,
        error: "That purchase is not a Team Licence.",
      };
    }

    if (getTeamAdminId(tx, anySeat.teamId) !== teamAdminId) {
      return { ok: false, status: 403, error: "Only the Team Admin can grant Seats." };
    }

    const student = tx
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();
    if (!student) {
      return {
        ok: false,
        status: 404,
        error: `No student found with email ${email}.`,
      };
    }

    const available = tx
      .select()
      .from(coupons)
      .where(
        and(
          eq(coupons.purchaseId, teamLicenceId),
          isNull(coupons.redeemedAt),
          isNull(coupons.grantedToUserId),
          isNull(coupons.refundedAt)
        )
      )
      .get();
    if (!available) {
      return {
        ok: false,
        status: 409,
        error: "No Unclaimed Seats left on this Team Licence.",
      };
    }

    tx.update(coupons)
      .set({
        grantedToUserId: student.id,
        grantedAt: new Date().toISOString(),
      })
      .where(eq(coupons.id, available.id))
      .run();

    return {
      ok: true,
      couponCode: available.code,
      invitedUserId: student.id,
      courseId: purchase.courseId,
    };
  });

  if (!decided.ok) return decided;

  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, decided.courseId))
    .get();
  const admin = db
    .select()
    .from(users)
    .where(eq(users.id, teamAdminId))
    .get();

  await notify({
    subscriberId: String(decided.invitedUserId),
    category: "seat-invite",
    payload: {
      courseTitle: course?.title ?? "your course",
      teamAdminName: admin?.name ?? "",
      teamLicenceId,
      claimLink: `/redeem/${decided.couponCode}`,
    },
  });

  return decided;
}
