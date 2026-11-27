import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type CategoryPreference,
} from "./notifier-preferences";
import type { NotificationCategory } from "./notifier.server";

// Canonical matrix from spec #12 — "Default preferences and critical flag".
// All five categories ship with in-app + email ON. `refund-status` and
// `seat-invite` are critical (non-toggleable in the preferences UI).
const EXPECTED: Record<
  NotificationCategory,
  { in_app: boolean; email: boolean; critical: boolean }
> = {
  "re-engagement": { in_app: true, email: true, critical: false },
  completion: { in_app: true, email: true, critical: false },
  "seat-invite": { in_app: true, email: true, critical: true },
  "refund-status": { in_app: true, email: true, critical: true },
  "team-progress": { in_app: true, email: true, critical: false },
};

describe("DEFAULT_NOTIFICATION_PREFERENCES", () => {
  it("covers all five spec categories exactly once", () => {
    const categories = DEFAULT_NOTIFICATION_PREFERENCES.map((p) => p.category)
      .slice()
      .sort();
    expect(categories).toEqual(
      (Object.keys(EXPECTED) as NotificationCategory[]).sort()
    );
  });

  it.each(
    Object.entries(EXPECTED) as [
      NotificationCategory,
      { in_app: boolean; email: boolean; critical: boolean },
    ][]
  )("matches the spec matrix for %s", (category, want) => {
    const pref = DEFAULT_NOTIFICATION_PREFERENCES.find(
      (p) => p.category === category
    ) as CategoryPreference | undefined;
    expect(pref).toBeDefined();
    expect(pref?.channels.in_app).toBe(want.in_app);
    expect(pref?.channels.email).toBe(want.email);
    expect(pref?.critical).toBe(want.critical);
  });

  it("flags exactly refund-status and seat-invite as critical", () => {
    const critical = DEFAULT_NOTIFICATION_PREFERENCES.filter(
      (p) => p.critical
    ).map((p) => p.category);
    expect(critical.sort()).toEqual(["refund-status", "seat-invite"]);
  });
});
