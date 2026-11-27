import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { TeamMemberRole, UserRole } from "~/db/schema";
import { redeemCoupon } from "./seat-claims.server";
import { notify, outboxTransport } from "./notifier.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

function seedTeamLicenceWithSeat(adminId: number, code: string) {
  const team = db.insert(schema.teams).values({}).returning().get();
  db.insert(schema.teamMembers)
    .values({ teamId: team.id, userId: adminId, role: TeamMemberRole.Admin })
    .run();
  const purchase = db
    .insert(schema.purchases)
    .values({ userId: adminId, courseId: base.course.id, amountPaid: 7900 })
    .returning()
    .get();
  db.insert(schema.coupons)
    .values({
      teamId: team.id,
      courseId: base.course.id,
      code,
      purchaseId: purchase.id,
    })
    .run();
  return { team, purchase };
}

describe("redeemCoupon", () => {
  it("fires team-progress seat-claimed to the Team Admin when a Student claims a Seat", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notifications-outbox-"));
    const admin = db
      .insert(schema.users)
      .values({ name: "Admin Ada", email: "ada@example.com", role: UserRole.Student })
      .returning()
      .get();
    const student = db
      .insert(schema.users)
      .values({ name: "Student Sam", email: "sam@example.com", role: UserRole.Student })
      .returning()
      .get();
    seedTeamLicenceWithSeat(admin.id, "CODE-1");

    const result = await redeemCoupon(
      db,
      "CODE-1",
      student.id,
      "",
      (n) => notify(n, outboxTransport(directory))
    );

    expect(result.ok).toBe(true);

    const files = readdirSync(directory);
    const teamFiles = files.filter((f) => f.includes("team-progress"));
    expect(teamFiles).toHaveLength(1);
    const written = JSON.parse(readFileSync(join(directory, teamFiles[0]), "utf8"));
    expect(written).toMatchObject({
      subscriberId: String(admin.id),
      category: "team-progress",
      payload: {
        studentName: student.name,
        studentId: student.id,
        courseTitle: base.course.title,
        watermark: "seat-claimed",
      },
    });
  });

  it("still writes the enrollment and does not fire when no team admin exists", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notifications-outbox-"));
    const student = db
      .insert(schema.users)
      .values({ name: "Sam", email: "sam@example.com", role: UserRole.Student })
      .returning()
      .get();
    const team = db.insert(schema.teams).values({}).returning().get();
    const purchase = db
      .insert(schema.purchases)
      .values({ userId: student.id, courseId: base.course.id, amountPaid: 7900 })
      .returning()
      .get();
    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: "ORPHAN",
        purchaseId: purchase.id,
      })
      .run();

    const result = await redeemCoupon(
      db,
      "ORPHAN",
      student.id,
      "",
      (n) => notify(n, outboxTransport(directory))
    );

    expect(result.ok).toBe(true);
    expect(readdirSync(directory)).toHaveLength(0);
  });
});
