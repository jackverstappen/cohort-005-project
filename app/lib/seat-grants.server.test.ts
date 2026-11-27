import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { TeamMemberRole, UserRole } from "~/db/schema";
import { grantSeatToStudent } from "./seat-grants.server";
import { notify, outboxTransport } from "./notifier.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

function makeTeamLicence(adminId: number, seats = 3) {
  const team = db.insert(schema.teams).values({}).returning().get();
  db.insert(schema.teamMembers)
    .values({ teamId: team.id, userId: adminId, role: TeamMemberRole.Admin })
    .run();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: adminId,
      courseId: base.course.id,
      amountPaid: 7900 * seats,
    })
    .returning()
    .get();
  for (let i = 0; i < seats; i++) {
    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `SEAT-${purchase.id}-${i}`,
        purchaseId: purchase.id,
      })
      .run();
  }
  return { team, purchase };
}

function addStudent(name: string, email: string) {
  return db
    .insert(schema.users)
    .values({ name, email, role: UserRole.Student })
    .returning()
    .get();
}

describe("grantSeatToStudent", () => {
  it("writes a seat-invite notification when a Team Admin grants a Seat", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notifications-outbox-"));
    const admin = db
      .insert(schema.users)
      .values({
        name: "Admin Ada",
        email: "ada@example.com",
        role: UserRole.Student,
      })
      .returning()
      .get();
    const student = addStudent("Student Sam", "sam@example.com");
    const { purchase } = makeTeamLicence(admin.id, 3);

    const result = await grantSeatToStudent(
      db,
      {
        teamLicenceId: purchase.id,
        studentEmail: "sam@example.com",
        teamAdminId: admin.id,
      },
      (notification) => notify(notification, outboxTransport(directory))
    );

    expect(result.ok).toBe(true);

    const files = readdirSync(directory);
    expect(files).toHaveLength(1);
    const written = JSON.parse(readFileSync(join(directory, files[0]), "utf8"));
    expect(written).toMatchObject({
      subscriberId: String(student.id),
      category: "seat-invite",
      payload: {
        courseTitle: base.course.title,
        teamAdminName: admin.name,
        teamLicenceId: purchase.id,
      },
    });
    expect(written.payload.claimLink).toMatch(/^\/redeem\/SEAT-/);

    // The Seat is marked granted to the student.
    const granted = db
      .select()
      .from(schema.coupons)
      .where(eq(schema.coupons.grantedToUserId, student.id))
      .get();
    expect(granted).toBeTruthy();
  });

  it("refuses when caller is not the Team Admin", async () => {
    const admin = db
      .insert(schema.users)
      .values({
        name: "Admin",
        email: "admin@example.com",
        role: UserRole.Student,
      })
      .returning()
      .get();
    const stranger = db
      .insert(schema.users)
      .values({ name: "Mal", email: "mal@example.com", role: UserRole.Student })
      .returning()
      .get();
    addStudent("Sam", "sam@example.com");
    const { purchase } = makeTeamLicence(admin.id, 1);

    const result = await grantSeatToStudent(db, {
      teamLicenceId: purchase.id,
      studentEmail: "sam@example.com",
      teamAdminId: stranger.id,
    });

    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses when no Seats are left", async () => {
    const admin = db
      .insert(schema.users)
      .values({
        name: "Admin",
        email: "admin@example.com",
        role: UserRole.Student,
      })
      .returning()
      .get();
    addStudent("Sam", "sam@example.com");
    const { purchase } = makeTeamLicence(admin.id, 1);

    const first = await grantSeatToStudent(db, {
      teamLicenceId: purchase.id,
      studentEmail: "sam@example.com",
      teamAdminId: admin.id,
    });
    expect(first.ok).toBe(true);

    const second = addStudent("Jo", "jo@example.com");
    void second;
    const result = await grantSeatToStudent(db, {
      teamLicenceId: purchase.id,
      studentEmail: "jo@example.com",
      teamAdminId: admin.id,
    });
    expect(result).toMatchObject({ ok: false, status: 409 });
  });
});
