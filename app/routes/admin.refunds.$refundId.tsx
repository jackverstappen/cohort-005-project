import type { Route } from "./+types/admin.refunds.$refundId";
import { data, isRouteErrorResponse, Link, redirect, useNavigation } from "react-router";
import { z } from "zod";
import { AlertTriangle, Check, CircleX } from "lucide-react";
import { eq } from "drizzle-orm";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { users, UserRole, RefundStatus } from "~/db/schema";
import {
  getRefundForAdmin,
  resolveRefund,
  type AdminRefundView,
  type PriorRefundGroup,
  type TeamSeatHistory,
} from "~/lib/refunds.server";
import { parseFormData, parseParams } from "~/lib/validation";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { formatPrice, formatRelativeTime } from "~/lib/utils";

const paramsSchema = z.object({ refundId: z.coerce.number().int() });

const actionSchema = z.object({
  intent: z.enum(["approve", "decline"]),
});

export function meta() {
  return [{ title: "Refund Request — Cadence" }];
}

function requireAdmin(currentUserId: number | null) {
  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }
  const user = db.select().from(users).where(eq(users.id, currentUserId)).get();
  if (!user || user.role !== UserRole.Admin) {
    throw data("Only admins can review refunds.", { status: 403 });
  }
  return user;
}

export async function loader({ params, request }: Route.LoaderArgs) {
  requireAdmin(await getCurrentUserId(request));
  const { refundId } = parseParams(params, paramsSchema);
  const view = getRefundForAdmin(refundId);
  if (!view) throw data("Refund request not found.", { status: 404 });
  return { view };
}

export async function action({ params, request }: Route.ActionArgs) {
  const currentUser = requireAdmin(await getCurrentUserId(request));
  const { refundId } = parseParams(params, paramsSchema);
  const formData = await request.formData();
  const parsed = parseFormData(formData, actionSchema);
  if (!parsed.success) {
    return data({ error: "Invalid input." }, { status: 400 });
  }

  const result = resolveRefund({
    refundId,
    decidedByUserId: currentUser.id,
    decision: parsed.data.intent,
  });

  if (!result.ok) {
    if (result.error === "not-found") {
      throw data("Refund request not found.", { status: 404 });
    }
    return data(
      { error: "This refund request has already been decided." },
      { status: 409 }
    );
  }

  return redirect(`/admin/refunds/${refundId}`);
}

function StatusBadge({ status }: { status: RefundStatus }) {
  const map: Record<RefundStatus, string> = {
    [RefundStatus.Open]:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    [RefundStatus.Approved]:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    [RefundStatus.Declined]:
      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status]}`}
    >
      {status === RefundStatus.Open
        ? "Open"
        : status === RefundStatus.Approved
          ? "Approved"
          : "Declined"}
    </span>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}

function SnapshotPanel({ snapshot }: { snapshot: AdminRefundView["snapshot"] }) {
  const watchHigh = snapshot.watchedHours >= 2;
  const daysHigh = snapshot.daysSincePurchase > 14;
  const seatsHigh = snapshot.seatsClaimed > 0;

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <h2 className="text-sm font-semibold">
          Eligibility snapshot
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            frozen at request time
          </span>
        </h2>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-6 py-6">
        <Stat
          label="Watched"
          value={
            <span className={watchHigh ? "text-red-600 dark:text-red-400" : ""}>
              {snapshot.watchedHours.toFixed(2)}h
            </span>
          }
          sub="hard limit 2h"
        />
        <Stat
          label="Days since purchase"
          value={
            <span className={daysHigh ? "text-red-600 dark:text-red-400" : ""}>
              {snapshot.daysSincePurchase}
            </span>
          }
          sub="hard limit 14 days"
        />
        <Stat
          label="Seats claimed"
          value={
            <span className={seatsHigh ? "text-red-600 dark:text-red-400" : ""}>
              {snapshot.seatsClaimed}
            </span>
          }
          sub="any claimed → hard block"
        />
      </CardContent>
    </Card>
  );
}

function HistoryPanel({
  history,
  snapshotWatchedHours,
}: {
  history: AdminRefundView["history"];
  snapshotWatchedHours: number;
}) {
  const watchDrift = history.currentWatchedHours - snapshotWatchedHours;
  const driftSignificant = watchDrift >= 0.1;

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <h2 className="text-sm font-semibold">Student history (live)</h2>
      </CardHeader>
      <CardContent className="py-6">
        {history.fromRefundedPurchase ? (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            This student has a prior approved refund on this course. Any engagement
            below may be leftover from that earlier purchase.
          </div>
        ) : null}
        {driftSignificant ? (
          <div className="mb-4 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200">
            Has watched {watchDrift.toFixed(2)}h more since requesting
            ({snapshotWatchedHours.toFixed(2)}h at request →{" "}
            {history.currentWatchedHours.toFixed(2)}h now).
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-6 md:grid-cols-6">
          <Stat
            label="Rating"
            value={history.rating ? `${history.rating}★` : "—"}
          />
          <Stat
            label="Lessons done"
            value={`${history.lessonsCompleted}/${history.totalLessons}`}
          />
          <Stat
            label="Watched now"
            value={`${history.currentWatchedHours.toFixed(2)}h`}
          />
          <Stat
            label="Quiz attempts"
            value={history.quizAttempts}
            sub={
              history.quizAttempts > 0
                ? `${history.quizzesPassed} passed`
                : undefined
            }
          />
          <Stat label="Comments" value={history.commentCount} />
          <Stat
            label="Last activity"
            value={
              history.lastActivityAt
                ? formatRelativeTime(history.lastActivityAt)
                : "—"
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function TeamSeatsPanel({ seats }: { seats: TeamSeatHistory[] }) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <h2 className="text-sm font-semibold">
          Team seats ({seats.length})
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            per-seat engagement, live
          </span>
        </h2>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <Th>Seat code</Th>
                <Th>Claimed by</Th>
                <Th>Claimed</Th>
                <Th>Lessons</Th>
                <Th>Watched</Th>
                <Th>Last activity</Th>
              </tr>
            </thead>
            <tbody>
              {seats.map((s) => (
                <tr
                  key={s.code}
                  className="border-b border-border last:border-0"
                >
                  <Td className="font-mono text-xs">{s.code}</Td>
                  <Td>
                    {s.claimant ? (
                      <div>
                        <div>{s.claimant.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.claimant.email}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Unclaimed</span>
                    )}
                  </Td>
                  <Td className="text-muted-foreground">
                    {s.claimedAt ? formatRelativeTime(s.claimedAt) : "—"}
                  </Td>
                  <Td>{s.lessonsCompleted}</Td>
                  <Td>{s.watchedHours.toFixed(1)}h</Td>
                  <Td className="text-muted-foreground">
                    {s.lastActivityAt
                      ? formatRelativeTime(s.lastActivityAt)
                      : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function PriorRefundsPanel({ groups }: { groups: PriorRefundGroup[] }) {
  if (groups.length === 0) {
    return (
      <Card>
        <CardHeader className="border-b border-border">
          <h2 className="text-sm font-semibold">Prior refund requests</h2>
        </CardHeader>
        <CardContent className="py-4 text-sm text-muted-foreground">
          None.
        </CardContent>
      </Card>
    );
  }

  const total = groups.reduce((n, g) => n + g.refunds.length, 0);

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <h2 className="text-sm font-semibold">
          Prior refund requests ({total})
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            across all this student's courses
          </span>
        </h2>
      </CardHeader>
      <CardContent className="space-y-3 py-4">
        {groups.map((g) => (
          <details
            key={g.courseId}
            className="rounded-md border border-border"
            open={g.isCurrentCourse}
          >
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm">
              <span>
                <span className="font-medium">{g.courseTitle}</span>
                {g.isCurrentCourse ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (this course)
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {g.refunds.filter((r) => r.status === RefundStatus.Approved)
                  .length}{" "}
                approved ·{" "}
                {g.refunds.filter((r) => r.status === RefundStatus.Declined)
                  .length}{" "}
                declined
              </span>
            </summary>
            <div className="border-t border-border divide-y divide-border">
              {g.refunds.map((r) => (
                <div key={r.id} className="px-4 py-3 text-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    <span className="text-xs text-muted-foreground">
                      requested {formatRelativeTime(r.requestedAt)}
                      {r.resolvedAt
                        ? ` · resolved ${formatRelativeTime(r.resolvedAt)}`
                        : ""}
                      {r.amountRefunded
                        ? ` · ${formatPrice(r.amountRefunded)} refunded`
                        : ""}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {r.reason}
                  </div>
                </div>
              ))}
            </div>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}

export default function AdminRefundDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { view } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const isOpen = view.refund.status === RefundStatus.Open;

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link to="/admin/refunds" className="hover:text-foreground">
          Refund Requests
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">#{view.refund.id}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">
              Refund request #{view.refund.id}
            </h1>
            <StatusBadge status={view.refund.status} />
          </div>
          <p className="mt-1 text-muted-foreground">
            {view.student.name} ·{" "}
            <span className="text-muted-foreground/80">
              {view.student.email}
            </span>{" "}
            · {view.course.title}
            {view.history.priorApprovedRefundsAcrossAllCourses > 0 ? (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                {view.history.priorApprovedRefundsAcrossAllCourses} prior approved
                refund
                {view.history.priorApprovedRefundsAcrossAllCourses === 1
                  ? ""
                  : "s"}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Paid {formatPrice(view.purchase.amountPaid)}
            {view.purchase.country ? ` from ${view.purchase.country}` : ""} ·
            Requested {formatRelativeTime(view.refund.requestedAt)}
            {view.refund.resolvedAt
              ? ` · Resolved ${formatRelativeTime(view.refund.resolvedAt)}${
                  view.refund.resolvedByName
                    ? ` by ${view.refund.resolvedByName}`
                    : ""
                }`
              : ""}
          </p>
        </div>

        {isOpen ? (
          <form method="post" className="flex items-center gap-2">
            {actionData && "error" in actionData ? (
              <span className="text-xs text-red-600 dark:text-red-400">
                {actionData.error}
              </span>
            ) : null}
            <Button
              type="submit"
              name="intent"
              value="decline"
              variant="outline"
              disabled={submitting}
            >
              <CircleX className="mr-1.5 size-4" />
              Decline
            </Button>
            <Button
              type="submit"
              name="intent"
              value="approve"
              disabled={submitting}
            >
              <Check className="mr-1.5 size-4" />
              Approve
            </Button>
          </form>
        ) : null}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="border-b border-border">
            <h2 className="text-sm font-semibold">Reason given</h2>
          </CardHeader>
          <CardContent className="py-4 text-sm whitespace-pre-wrap">
            {view.refund.reason}
          </CardContent>
        </Card>

        <SnapshotPanel snapshot={view.snapshot} />
        <HistoryPanel
          history={view.history}
          snapshotWatchedHours={view.snapshot.watchedHours}
        />
        {view.teamSeats ? <TeamSeatsPanel seats={view.teamSeats} /> : null}
        <PriorRefundsPanel groups={view.priorRefunds} />
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 text-sm ${className}`}>{children}</td>;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";
  if (isRouteErrorResponse(error)) {
    if (error.status === 401) title = "Sign in required";
    else if (error.status === 403) title = "Access denied";
    else if (error.status === 404) title = "Not found";
    else title = `Error ${error.status}`;
    message =
      typeof error.data === "string" ? error.data : error.statusText ?? message;
  }
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/admin/refunds">
          <Button>Back to refunds</Button>
        </Link>
      </div>
    </div>
  );
}
