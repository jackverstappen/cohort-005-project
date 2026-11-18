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

/**
 * Returns the HMAC-SHA256 subscriber hash for Novu secure mode, or `undefined`
 * when no key is configured. Callers must pass the result through to the Novu
 * widget as-is — in dev/tests the widget renders without secure mode. In
 * production the key is required: missing-in-prod throws so a deploy fails
 * loudly instead of silently downgrading security.
 */
export function signSubscriber(userId: string | number): string | undefined {
  const apiKey = process.env.NOVU_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NOVU_API_KEY is required in production to sign subscribers."
      );
    }
    return undefined;
  }
  return createHmac("sha256", apiKey).update(String(userId)).digest("hex");
}
