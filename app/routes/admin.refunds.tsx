import type { Route } from "./+types/admin.refunds";
import { data, isRouteErrorResponse, Link } from "react-router";
import { AlertTriangle, Receipt } from "lucide-react";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { users, UserRole } from "~/db/schema";
import { eq } from "drizzle-orm";
import { listOpenRefunds } from "~/lib/refunds.server";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { formatRelativeTime } from "~/lib/utils";

export function meta() {
  return [
    { title: "Refund Requests — Cadence" },
    { name: "description", content: "Review open refund requests" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to manage refunds.", {
      status: 401,
    });
  }
  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();
  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only admins can review refunds.", { status: 403 });
  }

  return { openRefunds: listOpenRefunds() };
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  const { openRefunds } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Refund Requests</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Refund Requests</h1>
        <p className="mt-1 text-muted-foreground">
          Open requests awaiting a decision.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Receipt className="size-4" />
        <span>
          {openRefunds.length}{" "}
          {openRefunds.length === 1 ? "request" : "requests"} open
        </span>
      </div>

      {openRefunds.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Receipt className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">No open refund requests.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <Th>Student</Th>
                    <Th>Course</Th>
                    <Th>Requested</Th>
                    <Th>Watched</Th>
                    <Th>Days since purchase</Th>
                    <Th>Seats claimed</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {openRefunds.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-0"
                    >
                      <Td>{r.studentName}</Td>
                      <Td>{r.courseTitle}</Td>
                      <Td className="text-muted-foreground">
                        {formatRelativeTime(r.requestedAt)}
                      </Td>
                      <Td>
                        {r.watchedHoursAtRequest.toFixed(2)}h
                      </Td>
                      <Td>{r.daysSincePurchaseAtRequest}d</Td>
                      <Td>{r.seatsClaimedAtRequest}</Td>
                      <Td>
                        <Link to={`/admin/refunds/${r.id}`}>
                          <Button size="sm" variant="outline" className="h-7 text-xs">
                            Review
                          </Button>
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
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
    if (error.status === 401) {
      title = "Sign in required";
      message = typeof error.data === "string" ? error.data : "";
    } else if (error.status === 403) {
      title = "Access denied";
      message = typeof error.data === "string" ? error.data : "";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
