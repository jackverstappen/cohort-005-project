import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  coupons,
  courses,
  enrollments,
  purchases,
  users,
} from "~/db/schema";
import { getSeatAvailability } from "~/lib/refunds.server";
import {
  notify as defaultNotify,
  type Notification,
} from "~/lib/notifier.server";
import { getTeamAdminId } from "~/lib/teams.server";

// ─── Seat claims ───
// A Student visits /redeem/<code> and claims the Seat granted to them. If the
// coupon belongs to a Team Licence (which, in practice, every coupon does),
// we fire team-progress (watermark: seat-claimed) to the Team Admin of that
// Licence's team so the buyer sees adoption happening.

export type Db = BetterSQLite3Database<typeof schema>;
type Notify = (notification: Notification) => Promise<void>;

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

export type RedeemResult =
  | { ok: true; enrollment: typeof enrollments.$inferSelect }
  | { ok: false; error: string };

export async function redeemCoupon(
  db: Db,
  code: string,
  userId: number,
  userCountry: string,
  notify: Notify = defaultNotify
): Promise<RedeemResult> {
  const coupon = db.select().from(coupons).where(eq(coupons.code, code)).get();
  if (!coupon) return { ok: false, error: "Coupon not found" };

  if (coupon.redeemedByUserId !== null) {
    return { ok: false, error: "Coupon has already been redeemed" };
  }

  const availability = getSeatAvailability(db, coupon);
  if (availability === "on_hold") return { ok: false, error: SEAT_ON_HOLD };
  if (availability === "refunded") return { ok: false, error: SEAT_REFUNDED };

  const existing = db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        eq(enrollments.courseId, coupon.courseId)
      )
    )
    .get();
  if (existing) {
    return { ok: false, error: "You are already enrolled in this course" };
  }

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, coupon.purchaseId))
    .get();

  if (purchase?.country && purchase.country !== userCountry) {
    return {
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    };
  }

  db.update(coupons)
    .set({
      redeemedByUserId: userId,
      redeemedAt: new Date().toISOString(),
    })
    .where(eq(coupons.id, coupon.id))
    .run();

  const enrollment = db
    .insert(enrollments)
    .values({ userId, courseId: coupon.courseId })
    .returning()
    .get();

  // Fire team-progress to the Team Admin of the Seat's team.
  const teamAdminId = getTeamAdminId(db, coupon.teamId);
  if (teamAdminId && teamAdminId !== userId) {
    const student = db.select().from(users).where(eq(users.id, userId)).get();
    const course = db
      .select()
      .from(courses)
      .where(eq(courses.id, coupon.courseId))
      .get();
    await notify({
      subscriberId: String(teamAdminId),
      category: "team-progress",
      payload: {
        studentName: student?.name ?? "",
        studentId: userId,
        courseTitle: course?.title ?? "",
        watermark: "seat-claimed",
      },
    });
  }

  return { ok: true, enrollment };
}
