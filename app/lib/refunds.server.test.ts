import { describe, it, expect } from "vitest";
import {
  groupPriorRefundsByCourse,
  type PriorRefundRow,
} from "./refunds.server";
import { RefundStatus } from "~/db/schema";

function row(overrides: Partial<PriorRefundRow>): PriorRefundRow {
  return {
    id: 1,
    status: RefundStatus.Declined,
    reason: "reason",
    requestedAt: "2026-01-01T00:00:00.000Z",
    resolvedAt: null,
    amountRefunded: null,
    courseId: 1,
    courseTitle: "Course 1",
    ...overrides,
  };
}

describe("groupPriorRefundsByCourse", () => {
  it("groups by course and puts the current course first", () => {
    const rows: PriorRefundRow[] = [
      row({ id: 1, courseId: 2, courseTitle: "Other" }),
      row({ id: 2, courseId: 1, courseTitle: "Current" }),
      row({ id: 3, courseId: 2, courseTitle: "Other" }),
    ];

    const groups = groupPriorRefundsByCourse(rows, 1);

    expect(groups[0].courseId).toBe(1);
    expect(groups[0].isCurrentCourse).toBe(true);
    expect(groups[0].refunds).toHaveLength(1);
    expect(groups[1].courseId).toBe(2);
    expect(groups[1].refunds).toHaveLength(2);
  });

  it("preserves both approved and declined in the same group", () => {
    const rows: PriorRefundRow[] = [
      row({
        id: 1,
        courseId: 7,
        status: RefundStatus.Approved,
        amountRefunded: 7900,
      }),
      row({ id: 2, courseId: 7, status: RefundStatus.Declined }),
    ];

    const groups = groupPriorRefundsByCourse(rows, 99);

    expect(groups).toHaveLength(1);
    const statuses = groups[0].refunds.map((r) => r.status);
    expect(statuses).toContain(RefundStatus.Approved);
    expect(statuses).toContain(RefundStatus.Declined);
  });

  it("orders non-current groups by most recent request desc", () => {
    const rows: PriorRefundRow[] = [
      row({
        id: 1,
        courseId: 2,
        courseTitle: "Older",
        requestedAt: "2025-01-01T00:00:00.000Z",
      }),
      row({
        id: 2,
        courseId: 3,
        courseTitle: "Newer",
        requestedAt: "2026-06-01T00:00:00.000Z",
      }),
    ];

    const groups = groupPriorRefundsByCourse(rows, 999);

    expect(groups[0].courseTitle).toBe("Newer");
    expect(groups[1].courseTitle).toBe("Older");
  });
});
