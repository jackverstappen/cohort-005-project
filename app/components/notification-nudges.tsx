// STUB — notification UI shape chosen by wayfinder ticket #11 (variant C).
// Renders inline nudge cards at the top of the Student dashboard body, plus a
// minimal bell (top-right) for transactional + informational notifications.
// Data is hard-coded placeholder until the follow-on build effort wires Novu
// per ADR 0006. Preference centre lives at /settings/notifications.
// Full prototype (variants A/B/C + switcher) on branch prototype/notification-placement.

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
import { Button } from "~/components/ui/button";

type Category =
  | "re-engagement"
  | "completion"
  | "seat-invite"
  | "refund-status"
  | "team-progress";

type Notification = {
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

// PLACEHOLDER. Replaced by Novu subscriber feed in the build effort.
const PLACEHOLDER_NOTIFICATIONS: Notification[] = [
  {
    id: "n1",
    category: "re-engagement",
    title: "React Patterns — 5 days since your last lesson",
    body: "You left off in Lesson 3. Resume to keep your streak going.",
    ts: "2h ago",
    read: false,
  },
  {
    id: "n2",
    category: "completion",
    title: "You're 12 minutes from completing TypeScript Deep Dive",
    body: "One lesson left in Module 4.",
    ts: "Yesterday",
    read: false,
  },
  {
    id: "n3",
    category: "seat-invite",
    title: "Acme Corp invited you to Advanced Testing",
    body: "Claim your seat before the invite expires.",
    ts: "3 days ago",
    read: true,
  },
  {
    id: "n4",
    category: "refund-status",
    title: "Refund approved: Vue Fundamentals ($49)",
    body: "The funds will appear in your account within 5 business days.",
    ts: "Last week",
    read: true,
  },
];

function TrayRow({ n }: { n: Notification }) {
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

export function NudgeCards() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const actionable = PLACEHOLDER_NOTIFICATIONS.filter(
    (n) =>
      (n.category === "re-engagement" || n.category === "completion") &&
      !dismissed.has(n.id)
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
              onClick={() => setDismissed((d) => new Set(d).add(n.id))}
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

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const tray = PLACEHOLDER_NOTIFICATIONS.filter(
    (n) => n.category !== "re-engagement" && n.category !== "completion"
  );
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
            {tray.map((n) => (
              <TrayRow key={n.id} n={n} />
            ))}
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
