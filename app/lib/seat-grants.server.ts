import { and, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { coupons, courses, purchases, users } from "~/db/schema";
import {
  notify as defaultNotify,
  type Notification,
} from "~/lib/notifier.server";
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

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type GrantSeatParams = {
  teamLicenceId: number;
  studentEmail: string;
  teamAdminId: number;
};

type GrantFailure = Extract<GrantResult, { ok: false }>;
type GrantTargets = {
  purchase: typeof purchases.$inferSelect;
  student: typeof users.$inferSelect;
  availableSeat: typeof coupons.$inferSelect;
};

function resolveTeamLicence(
  tx: Tx,
  teamLicenceId: number,
  teamAdminId: number
): { purchase: typeof purchases.$inferSelect } | GrantFailure {
  const purchase = tx
    .select()
    .from(purchases)
    .where(eq(purchases.id, teamLicenceId))
    .get();
  if (!purchase) {
    return { ok: false, status: 404, error: "Team Licence not found." };
  }

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
    return {
      ok: false,
      status: 403,
      error: "Only the Team Admin can grant Seats.",
    };
  }

  return { purchase };
}

function findAvailableSeat(
  tx: Tx,
  teamLicenceId: number
): typeof coupons.$inferSelect | null {
  return (
    tx
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
      .get() ?? null
  );
}

function resolveGrantTargets(
  tx: Tx,
  params: GrantSeatParams
): GrantTargets | GrantFailure {
  const licence = resolveTeamLicence(
    tx,
    params.teamLicenceId,
    params.teamAdminId
  );
  if ("ok" in licence) return licence;

  const student = tx
    .select()
    .from(users)
    .where(eq(users.email, params.studentEmail))
    .get();
  if (!student) {
    return {
      ok: false,
      status: 404,
      error: `No student found with email ${params.studentEmail}.`,
    };
  }

  const availableSeat = findAvailableSeat(tx, params.teamLicenceId);
  if (!availableSeat) {
    return {
      ok: false,
      status: 409,
      error: "No Unclaimed Seats left on this Team Licence.",
    };
  }

  return { purchase: licence.purchase, student, availableSeat };
}

function claimSeatForStudent(tx: Tx, params: GrantSeatParams): GrantResult {
  const targets = resolveGrantTargets(tx, params);
  if ("ok" in targets) return targets;

  const { purchase, student, availableSeat } = targets;
  tx.update(coupons)
    .set({
      grantedToUserId: student.id,
      grantedAt: new Date().toISOString(),
    })
    .where(eq(coupons.id, availableSeat.id))
    .run();

  return {
    ok: true,
    couponCode: availableSeat.code,
    invitedUserId: student.id,
    courseId: purchase.courseId,
  };
}

/**
 * Grants an Unclaimed, un-granted Seat on `teamLicenceId` to the Student with
 * `studentEmail`. On success writes a seat-invite notification.
 */
export async function grantSeatToStudent(
  db: Db,
  params: GrantSeatParams,
  notify: Notify = defaultNotify
): Promise<GrantResult> {
  const studentEmail = params.studentEmail.trim().toLowerCase();
  if (studentEmail.length === 0) {
    return { ok: false, status: 400, error: "Give the student's email." };
  }

  const decided = db.transaction(
    (tx): GrantResult => claimSeatForStudent(tx, { ...params, studentEmail })
  );
  if (!decided.ok) return decided;

  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, decided.courseId))
    .get();
  const admin = db
    .select()
    .from(users)
    .where(eq(users.id, params.teamAdminId))
    .get();

  await notify({
    subscriberId: String(decided.invitedUserId),
    category: "seat-invite",
    payload: {
      courseTitle: course?.title ?? "your course",
      teamAdminName: admin?.name ?? "",
      teamLicenceId: params.teamLicenceId,
      claimLink: `/redeem/${decided.couponCode}`,
    },
  });

  return decided;
}
