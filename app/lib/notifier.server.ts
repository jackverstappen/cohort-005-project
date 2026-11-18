import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ─── Notifications ───
// A single seam for every notification Cadence sends. Novu delivers the message
// when NOVU_API_KEY is set; without a key (local dev, tests) each trigger is
// written to .notifications-outbox/ as a JSON file instead, mirroring the
// mailer.server.ts outbox pattern. No trigger site imports the Novu SDK —
// replacing Novu later means swapping this file.

export type NotificationCategory =
  | "re-engagement"
  | "completion"
  | "seat-invite"
  | "refund-status"
  | "team-progress";

export type Notification = {
  subscriberId: string;
  category: NotificationCategory;
  payload: Record<string, unknown>;
};

export interface NotificationTransport {
  send(notification: Notification): Promise<void>;
}

const NOVU_API_BASE = "https://eu.api.novu.co";

export function novuTransport(apiKey: string): NotificationTransport {
  const identified = new Set<string>();

  async function identify(subscriberId: string) {
    if (identified.has(subscriberId)) return;
    const response = await fetch(`${NOVU_API_BASE}/v1/subscribers`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `ApiKey ${apiKey}`,
      },
      body: JSON.stringify({ subscriberId }),
    });

    // Novu's identify is idempotent; treat 201 and 200 as success. A 409 means
    // the subscriber already exists, which is fine too.
    if (!response.ok && response.status !== 409) {
      throw new Error(
        `Novu rejected the subscriber ${subscriberId}: ${response.status}`
      );
    }
    identified.add(subscriberId);
  }

  return {
    async send(notification) {
      await identify(notification.subscriberId);

      const response = await fetch(`${NOVU_API_BASE}/v1/events/trigger`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `ApiKey ${apiKey}`,
        },
        body: JSON.stringify({
          name: notification.category,
          to: { subscriberId: notification.subscriberId },
          payload: notification.payload,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Novu rejected the ${notification.category} notification to ${notification.subscriberId}: ${response.status}`
        );
      }
    },
  };
}

export function outboxTransport(directory: string): NotificationTransport {
  return {
    async send(notification) {
      mkdirSync(directory, { recursive: true });
      const file = join(
        directory,
        `${Date.now()}-${notification.category}-${notification.subscriberId}.json`
      );
      writeFileSync(file, JSON.stringify(notification, null, 2));
    },
  };
}

// Module-level cache so the `identified` Set inside novuTransport persists
// across notify() calls — otherwise every call rebuilt a fresh transport with
// an empty identify cache and paid for an identify round-trip every send.
let cachedDefaultTransport: NotificationTransport | undefined;

function defaultTransport(): NotificationTransport {
  if (cachedDefaultTransport) return cachedDefaultTransport;
  const apiKey = process.env.NOVU_API_KEY;
  cachedDefaultTransport = apiKey
    ? novuTransport(apiKey)
    : outboxTransport(".notifications-outbox");
  return cachedDefaultTransport;
}

/** Test hook — reset the memoized default transport. Only for unit tests. */
export function __resetDefaultTransportForTests(): void {
  cachedDefaultTransport = undefined;
}

export async function notify(
  notification: Notification,
  transport: NotificationTransport = defaultTransport()
): Promise<void> {
  await transport.send(notification);
}
