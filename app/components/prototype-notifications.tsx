// PROTOTYPE — notification placement (#11). Throwaway. Not for production.
// Three variants of where/how notifications surface on the Student dashboard.
// Switchable via ?variant=A|B|C on /dashboard. Fake data, no Novu wiring.

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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

type FakeNotification = {
  id: string;
  category: Category;
  title: string;
  body: string;
  ts: string;
  read: boolean;
  href: string;
};

const CATEGORY_ICON: Record<Category, typeof Bell> = {
  "re-engagement": PlayCircle,
  completion: GraduationCap,
  "seat-invite": Ticket,
  "refund-status": CreditCard,
  "team-progress": Users,
};

const CATEGORY_LABEL: Record<Category, string> = {
  "re-engagement": "Pick up where you left off",
  completion: "Nearly done",
  "seat-invite": "Seat invite",
  "refund-status": "Refund update",
  "team-progress": "Team progress",
};

const FAKE_NOTIFICATIONS: FakeNotification[] = [
  {
    id: "n1",
    category: "re-engagement",
    title: "React Patterns — 5 days since your last lesson",
    body: "You left off in Lesson 3. Resume to keep your streak going.",
    ts: "2h ago",
    read: false,
    href: "/dashboard",
  },
  {
    id: "n2",
    category: "completion",
    title: "You're 12 minutes from completing TypeScript Deep Dive",
    body: "One lesson left in Module 4.",
    ts: "Yesterday",
    read: false,
    href: "/dashboard",
  },
  {
    id: "n3",
    category: "seat-invite",
    title: "Acme Corp invited you to Advanced Testing",
    body: "Claim your seat before the invite expires.",
    ts: "3 days ago",
    read: true,
    href: "/dashboard",
  },
  {
    id: "n4",
    category: "refund-status",
    title: "Refund approved: Vue Fundamentals ($49)",
    body: "The funds will appear in your account within 5 business days.",
    ts: "Last week",
    read: true,
    href: "/dashboard",
  },
  {
    id: "n5",
    category: "team-progress",
    title: "Jordan completed React Patterns",
    body: "Your team member finished all 12 lessons.",
    ts: "Last week",
    read: true,
    href: "/dashboard",
  },
];

function unreadCount(items: FakeNotification[]) {
  return items.filter((n) => !n.read).length;
}

function NotificationRow({ n }: { n: FakeNotification }) {
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

// ============================================================================
// Variant A — Classic bell + dropdown panel
// ============================================================================

export function VariantABell() {
  const [open, setOpen] = useState(false);
  const [items] = useState(FAKE_NOTIFICATIONS);
  const unread = unreadCount(items);

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
            <button className="text-xs text-muted-foreground hover:text-foreground">
              Mark all read
            </button>
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            {items.map((n) => (
              <NotificationRow key={n.id} n={n} />
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

// ============================================================================
// Variant B — Sidebar activity rail (always-visible floating panel on the right,
// simulating what an activity rail integrated in the real sidebar would look like)
// ============================================================================

export function VariantBActivityRail() {
  const [items] = useState(FAKE_NOTIFICATIONS.slice(0, 5));
  return (
    <aside className="fixed right-0 top-0 z-20 flex h-screen w-[320px] flex-col border-l bg-muted/30">
      <div className="flex items-center justify-between border-b bg-background p-3">
        <p className="text-sm font-semibold">Activity</p>
        <a
          href="/settings/notifications"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Manage
        </a>
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.map((n) => (
          <NotificationRow key={n.id} n={n} />
        ))}
      </div>
      <div className="border-t bg-background p-2 text-center">
        <a
          href="/settings/notifications"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          See all notifications
        </a>
      </div>
    </aside>
  );
}

// ============================================================================
// Variant C — Inline dashboard cards for action, minimal bell for the rest
// ============================================================================

export function VariantCInlineCards() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [bellOpen, setBellOpen] = useState(false);
  const actionable = FAKE_NOTIFICATIONS.filter(
    (n) =>
      (n.category === "re-engagement" || n.category === "completion") &&
      !dismissed.has(n.id)
  );
  const tray = FAKE_NOTIFICATIONS.filter(
    (n) => n.category !== "re-engagement" && n.category !== "completion"
  );
  const unread = unreadCount(tray);

  return (
    <>
      {/* Inline cards slot into the dashboard body via a portal-ish wrapper */}
      <div className="mx-auto max-w-7xl px-6 pt-6 lg:px-8">
        {actionable.length > 0 && (
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
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {n.body}
                    </p>
                  </div>
                  <Button size="sm" variant="default" className="flex-shrink-0">
                    <PlayCircle className="mr-1.5 size-3.5" />
                    Continue
                  </Button>
                  <button
                    onClick={() =>
                      setDismissed((d) => new Set(d).add(n.id))
                    }
                    className="flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Dismiss"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Minimal bell for transactional + team-progress */}
      <div className="fixed right-6 top-6 z-30">
        <button
          onClick={() => setBellOpen((o) => !o)}
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
        {bellOpen && (
          <div className="absolute right-0 top-12 w-[380px] rounded-lg border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b p-3">
              <p className="text-sm font-semibold">Notifications</p>
              <span className="text-xs text-muted-foreground">
                Nudges are in your dashboard
              </span>
            </div>
            <div className="max-h-[480px] overflow-y-auto">
              {tray.map((n) => (
                <NotificationRow key={n.id} n={n} />
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
    </>
  );
}

// ============================================================================
// Toast demo — all three variants share Sonner for live events
// ============================================================================

export function LiveToastDemo({ variant }: { variant: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      const sample = CATEGORY_LABEL["seat-invite"];
      toast(sample, {
        description: `Acme Corp invited you to Advanced Testing (variant ${variant})`,
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [variant]);
  return null;
}

// ============================================================================
// Floating variant switcher
// ============================================================================

const VARIANTS = [
  { key: "A", name: "Bell + dropdown" },
  { key: "B", name: "Sidebar activity rail" },
  { key: "C", name: "Inline cards + minimal bell" },
] as const;

export function PrototypeSwitcher() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const current = params.get("variant") ?? "A";
  const idx = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === current)
  );
  const cur = VARIANTS[idx];

  function go(delta: number) {
    const next = VARIANTS[(idx + delta + VARIANTS.length) % VARIANTS.length];
    const p = new URLSearchParams(params);
    p.set("variant", next.key);
    setParams(p, { replace: true });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border-2 border-foreground bg-background px-2 py-1 shadow-lg">
        <button
          onClick={() => go(-1)}
          className="rounded-full p-1.5 hover:bg-muted"
          aria-label="Previous variant"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-3 text-xs font-semibold">
          {cur.key} — {cur.name}
        </span>
        <button
          onClick={() => go(1)}
          className="rounded-full p-1.5 hover:bg-muted"
          aria-label="Next variant"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
