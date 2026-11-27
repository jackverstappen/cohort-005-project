import { useState } from "react";
import {
  Bell,
  CreditCard,
  GraduationCap,
  PlayCircle,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { useNotifications } from "@novu/react/hooks";
import { Button } from "~/components/ui/button";

export type Category =
  | "re-engagement"
  | "completion"
  | "seat-invite"
  | "refund-status"
  | "team-progress";

const NUDGE_CATEGORIES = new Set<Category>(["re-engagement", "completion"]);

export type UINotification = {
  id: string;
  category: Category;
  title: string;
  body: string;
  ts: string;
  read: boolean;
};

const CATEGORY_ICON: Record<Category, typeof Bell> = {
  "re-engagement": PlayCircle,
  completion: GraduationCap,
  "seat-invite": Ticket,
  "refund-status": CreditCard,
  "team-progress": Users,
};

function isCategory(identifier: string | undefined): identifier is Category {
  return (
    identifier === "re-engagement" ||
    identifier === "completion" ||
    identifier === "seat-invite" ||
    identifier === "refund-status" ||
    identifier === "team-progress"
  );
}

function formatRelative(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  if (Number.isNaN(diffMs)) return "";
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < hour) return `${Math.max(1, Math.round(diffMs / minute))}m ago`;
  if (diffMs < day) return `${Math.round(diffMs / hour)}h ago`;
  if (diffMs < 7 * day) return `${Math.round(diffMs / day)}d ago`;
  return new Date(createdAt).toLocaleDateString();
}

type NovuLikeNotification = {
  id: string;
  subject?: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  workflow?: { identifier: string };
};

export function adaptNotification(
  n: NovuLikeNotification
): UINotification | null {
  const identifier = n.workflow?.identifier;
  if (!isCategory(identifier)) return null;
  return {
    id: n.id,
    category: identifier,
    title: n.subject ?? "",
    body: n.body,
    ts: formatRelative(n.createdAt),
    read: n.isRead,
  };
}

export function partitionForNudges(items: UINotification[]): UINotification[] {
  return items.filter((n) => NUDGE_CATEGORIES.has(n.category));
}

export function partitionForTray(items: UINotification[]): UINotification[] {
  return items.filter((n) => !NUDGE_CATEGORIES.has(n.category));
}

function TrayRow({ n }: { n: UINotification }) {
  const Icon = CATEGORY_ICON[n.category];
  return (
    <div
      className={`flex gap-3 p-3 ${n.read ? "opacity-70" : "bg-muted/40"} border-b last:border-b-0`}
    >
      <Icon className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-tight">{n.title}</p>
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {n.ts}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {n.body}
        </p>
      </div>
    </div>
  );
}

/**
 * Pure render: nudge cards for re-engagement + completion. Filters defensively
 * so callers can pass the entire feed. Dismissal fires `onDismiss(id)`.
 */
export function NudgeCardsView({
  notifications,
  onDismiss,
}: {
  notifications: UINotification[];
  onDismiss: (id: string) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const actionable = partitionForNudges(notifications).filter(
    (n) => !dismissed.has(n.id)
  );
  if (actionable.length === 0) return null;
  return (
    <div className="mb-6 space-y-3">
      {actionable.map((n) => {
        const Icon = CATEGORY_ICON[n.category];
        return (
          <div
            key={n.id}
            className="flex items-start gap-3 rounded-lg border bg-background p-4 shadow-sm"
          >
            <div className="mt-0.5 flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
            </div>
            <Button size="sm" variant="default" className="flex-shrink-0">
              <PlayCircle className="mr-1.5 size-3.5" />
              Continue
            </Button>
            <button
              onClick={() => {
                setDismissed((d) => new Set(d).add(n.id));
                onDismiss(n.id);
              }}
              className="flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Pure render: bell + tray for the three non-nudge categories.
 */
export function NotificationBellView({
  notifications,
}: {
  notifications: UINotification[];
}) {
  const [open, setOpen] = useState(false);
  const tray = partitionForTray(notifications);
  const unread = tray.filter((n) => !n.read).length;
  return (
    <div className="fixed right-6 top-6 z-30">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex size-10 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted"
        aria-label="Notifications"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 w-[380px] rounded-lg border bg-background shadow-xl">
          <div className="flex items-center justify-between border-b p-3">
            <p className="text-sm font-semibold">Notifications</p>
            <span className="text-xs text-muted-foreground">
              Nudges are in your dashboard
            </span>
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            {tray.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                You&apos;re all caught up.
              </p>
            ) : (
              tray.map((n) => <TrayRow key={n.id} n={n} />)
            )}
          </div>
          <div className="border-t p-2 text-center">
            <a
              href="/settings/notifications"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Manage preferences
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function adaptAll(
  notifications: ReadonlyArray<{
    id: string;
    subject?: string;
    body: string;
    isRead: boolean;
    createdAt: string;
    workflow?: { identifier: string };
  }>
): UINotification[] {
  return notifications
    .map((n) =>
      adaptNotification({
        id: n.id,
        subject: n.subject,
        body: n.body,
        isRead: n.isRead,
        createdAt: n.createdAt,
        workflow: n.workflow
          ? { identifier: n.workflow.identifier }
          : undefined,
      })
    )
    .filter((n): n is UINotification => n !== null);
}

/**
 * Thin wrapper: subscribes via `@novu/react`'s `useNotifications` hook and
 * forwards the feed (adapted to `UINotification`) to the pure `NudgeCardsView`.
 * Dismissal marks the Novu feed item as read.
 */
export function NudgeCards() {
  const { notifications } = useNotifications();
  const items = adaptAll(notifications ?? []);

  const handleDismiss = (id: string) => {
    const match = notifications?.find((n) => n.id === id);
    if (match) void match.read();
  };

  return <NudgeCardsView notifications={items} onDismiss={handleDismiss} />;
}

/**
 * Thin wrapper: subscribes via `@novu/react`'s `useNotifications` hook and
 * forwards the feed to the pure `NotificationBellView`.
 */
export function NotificationBell() {
  const { notifications } = useNotifications();
  const items = adaptAll(notifications ?? []);
  return <NotificationBellView notifications={items} />;
}
