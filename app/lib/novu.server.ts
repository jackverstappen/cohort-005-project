// Shared Novu client helpers.
//
// `signSubscriber(userId)` returns the HMAC-SHA256 of the subscriber id keyed
// on NOVU_API_KEY. The `/settings/notifications` loader and the in-app Inbox
// loader both call this so `<Inbox>` can run in secure mode.
//
// Lives alongside `notifier.server.ts` rather than inside it because the two
// concerns compose but are distinct: `notifier.server.ts` fires server-side
// triggers (no hash needed); this module serves browser-side subscriber auth.

import { createHmac } from "node:crypto";

export function signSubscriber(userId: string | number): string {
  const apiKey = process.env.NOVU_API_KEY;
  if (!apiKey) {
    // In dev/tests without a key, Novu's secure mode is not configured; return
    // a deterministic placeholder so the UI can still render and tests don't
    // trip over an environment branch.
    return "";
  }
  return createHmac("sha256", apiKey).update(String(userId)).digest("hex");
}
