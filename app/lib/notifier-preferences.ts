// Canonical default notification preferences matrix.
//
// New Cadence subscribers get this matrix in Novu. `refund-status` and
// `seat-invite` carry `critical: true` and must be surfaced as non-toggleable
// in the preference UI (Novu enforces delivery regardless of the toggle).
//
// This module is the single source of truth for the matrix — the test in
// `notifier-preferences.test.ts` asserts against it, and ticket #15 / the
// Novu workflow configuration must stay in sync.

import type { NotificationCategory } from "./notifier.server";

export type NotificationChannel = "in_app" | "email";

export type CategoryPreference = {
  category: NotificationCategory;
  channels: Record<NotificationChannel, boolean>;
  critical: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: readonly CategoryPreference[] = [
  {
    category: "re-engagement",
    channels: { in_app: true, email: true },
    critical: false,
  },
  {
    category: "completion",
    channels: { in_app: true, email: true },
    critical: false,
  },
  {
    category: "seat-invite",
    channels: { in_app: true, email: true },
    critical: true,
  },
  {
    category: "refund-status",
    channels: { in_app: true, email: true },
    critical: true,
  },
  {
    category: "team-progress",
    channels: { in_app: true, email: true },
    critical: false,
  },
] as const;
