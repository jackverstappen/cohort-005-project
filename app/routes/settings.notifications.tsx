import { data, isRouteErrorResponse, Link } from "react-router";
import { AlertTriangle } from "lucide-react";
import { Inbox, Preferences } from "@novu/react";
import type { Route } from "./+types/settings.notifications";
import { getCurrentUserId } from "~/lib/session";
import { signSubscriber } from "~/lib/novu.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

export function meta() {
  return [
    { title: "Notification preferences — Cadence" },
    {
      name: "description",
      content: "Manage your notification channels per category",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel", {
      status: 401,
    });
  }

  const subscriberId = String(currentUserId);

  return {
    subscriberId,
    subscriberHash: signSubscriber(subscriberId),
    applicationIdentifier: process.env.NOVU_APPLICATION_IDENTIFIER ?? "",
  };
}

export default function NotificationsSettings({
  loaderData,
}: Route.ComponentProps) {
  const { subscriberId, subscriberHash, applicationIdentifier } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link to="/settings" className="hover:text-foreground">
          Settings
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Notifications</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Notification preferences</h1>
        <p className="mt-1 text-muted-foreground">
          Choose how Cadence reaches you for each category. Refund status and
          seat invites are critical and always on.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <h2 className="text-lg font-semibold">Channels</h2>
        </CardHeader>
        <CardContent>
          {applicationIdentifier ? (
            <Inbox
              applicationIdentifier={applicationIdentifier}
              subscriber={subscriberId}
              subscriberHash={subscriberHash}
            >
              <Preferences />
            </Inbox>
          ) : (
            <p className="text-sm text-muted-foreground">
              Notification preferences are unavailable —
              NOVU_APPLICATION_IDENTIFIER is not configured.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
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
