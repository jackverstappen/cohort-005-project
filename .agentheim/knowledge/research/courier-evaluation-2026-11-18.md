---
topic: Courier (courier.com) as notification service for Cadence
date: 2026-11-18
requested_by: user
related_tasks: [#5]
---

# Research: Courier Notification Service Evaluation for Cadence

## Question

Is Courier (courier.com) the right notification infrastructure for Cadence, a small React (React Router v7) video-course platform? Evaluate against: in-app + email in one SDK, EU data residency tier gating, free-tier limits and growth path, preference/opt-out centre, web + mobile push, trigger-category modelling, and integration shape.

## Summary

- **One trigger, many channels.** Courier's core value proposition is exactly this: one `client.send.message()` call with routing rules fans out to in-app inbox, email, push, SMS, Slack, etc. simultaneously. The React SDK ships `<CourierInbox />`, `<CourierInboxPopupMenu />`, `<CourierToast />`, and `<CourierPreferences />` as ready-made components. [1][2]
- **EU data residency costs money.** The EU datacenter (Ireland, endpoint `api.eu.courier.com`) is available on Business and Enterprise plans — not the free Developer tier. For a GDPR-conscious EU product, the free tier is effectively off-limits for production. [3][4]
- **Free tier is send-based, not MAU-based.** Developer plan: 10,000 sends/month, no per-seat charge. Business: $0.005/send flat regardless of channel. At 1K–10K MAU with moderate engagement a small platform will burn the free tier quickly and move to Business, where cost scales linearly with sends. [5]
- **Preference centre is first-class.** Hosted page + embeddable `<CourierPreferences />` component, per-topic AND per-channel toggle, `REQUIRED` override for transactional/security messages that bypasses opt-out. This is GDPR-adequate out of the box. [6][7]
- **Push is available but via third-party adapters.** Courier wraps FCM, APNs, Expo, OneSignal, etc. Browser web push uses VAPID via FCM or a compatible provider. No tier gating on push channels found in docs — push counts as a normal send. [8]

## Findings

### 1. In-app + email in one SDK

Courier delivers a unified fanout model: a single API call sends to multiple channels according to routing rules you configure per template. The React SDK (`@trycourier/courier-react` v9, React 18+; `@trycourier/courier-react-17` for React 17) exposes four ready-made UI components [1]:

- `<CourierInbox />` — full-height inline notification feed
- `<CourierInboxPopupMenu />` — bell-icon button with dropdown overlay (configurable width, height, alignment)
- `<CourierToast />` — ephemeral overlay toast synced to the same real-time feed as the inbox
- `<CourierPreferences />` — in-app preference management

Toasts and inbox share the same real-time message feed and authentication, so a single backend notification populates both surfaces without duplicate triggers. [2] The `useCourier()` hook returns `{ shared, auth, inbox, toast, preferences }` for programmatic control.

Authentication is JWT-based: your backend mints a JWT with the Courier API key (scopes `inbox:read:messages` and `inbox:write:events`), and the client calls `auth.signIn({ userId, jwt })`. The API key never leaves the server. [1]

**React Router v7 fit:** Courier components render client-side only. In a React Router v7 app this means adding `'use client'` (or equivalent) to the layout file that imports Courier components. JWT minting sits naturally in a loader or action on the server. No fundamental blockers — it is the same pattern as Next.js App Router. [1]

### 2. EU data residency

Courier operates two datacenters: US and EU (Ireland). The EU datacenter is **available on Business and Enterprise paid plans only** — not the free Developer tier. [3][4]

| Service | EU Endpoint |
|---------|-------------|
| Console | `https://app.eu.courier.com` |
| API | `https://api.eu.courier.com` |
| Inbox | `https://inbox.eu.courier.io` |
| Inbox Real-time (WSS) | `wss://realtime.eu.courier.io` |

Switching to the EU region requires changing the base URL in your SDK/API calls; workspace configuration and API keys carry over. [3] Courier also provides dedicated EU endpoints for GDPR data deletion and subject access requests. [4]

**Verdict for Cadence:** If Cadence serves EU users and must keep notification data in the EU, the minimum viable plan is Business ($0.005/send). The free Developer tier is not suitable for production EU use.

### 3. Free tier limits and growth path

| Plan | Price | Limit |
|------|-------|-------|
| Developer (free) | $0 | 10,000 sends/month |
| Business | $0.005/send | Unlimited, pay-as-you-go |
| Enterprise | Custom (below $0.005 at volume) | Custom |

Courier bills per *send*, where one send = one template dispatched to one recipient. A single trigger that fans out to email + in-app counts as one send, not two. [5] This is notably different from competitors that bill per channel.

**Growth modelling for Cadence (1K–10K MAU, ~5 notification categories):**

Suppose 5K MAU with 3 notifications/user/week on average = ~60K sends/month. At $0.005 that is $300/month. At 10K MAU and the same rate: ~$600/month. The Business tier has no platform fee, so the cost scales linearly. For EU residency add zero extra cost — it is included in Business. [3][5]

The free tier (10K sends) might cover a very early beta (a few hundred active users, low notification frequency) but will not sustain a launched product.

### 4. Preference / opt-out centre

Courier's preference system is modelled as *topics* (categories) within *sections*, with two deployment modes [6][7]:

- **Hosted page** — Courier-managed URL with optional branding. Link users to it from emails/unsubscribe links.
- **Embeddable component** (`<CourierPreferences />`) — renders inside your app; keeps users in-product.

Granularity:
- Per-topic opt-in/opt-out
- Per-channel routing within each topic (user picks email vs push vs both for each category)
- Digest schedule per topic

GDPR-relevant features:
- Topics can be marked `REQUIRED` (transactional/security messages that legally cannot be suppressed). Courier ignores the user's opt-out for these topics and always delivers. [6]
- Preferences are tenant-scoped, so a user in multiple teams gets separate settings per team — prevents cross-tenant bleed. [6]
- Courier checks preferences on every send and skips opted-out channels/topics automatically; no application-layer filtering needed.
- Courier holds SOC 2 Type II, HIPAA, and PCI DSS; supports GDPR and CCPA obligations. DPA available on Enterprise. [7]

This is GDPR-grade out of the box: per-channel, per-topic, with a hosted unsubscribe page, opt-out enforcement on every send, and a REQUIRED override for receipts/security alerts.

### 5. Web + mobile push

**Mobile push:** Courier wraps FCM (Android + web via Web Push protocol) and APNs (iOS) natively, plus Expo, OneSignal, Airship, Amazon SNS, Pusher Beams, MagicBell, and others. [8] No tier gating found in the documentation — all push integrations appear on all plans.

**Browser (web) push:** Courier's guides describe using FCM's Web Push protocol (VAPID keys + service worker) for browser notifications, routed through Courier's unified API. The browser subscription object is stored as a device token on the recipient profile. [9] Direct native VAPID support (without FCM) was not documented at the time of this research — FCM as the web push adapter is the described path.

**SDK coverage for mobile:** Courier ships SDKs for React Native and Flutter for mobile in-app + push, in addition to the web React SDK. [2]

### 6. Trigger categories

Courier templates are identified by a `nt_` ID or a human alias (e.g., `course-completion-nudge`). A `client.send.message()` call references a template and passes `data` (merge variables) and `to` (recipient). Topics in the preference system map 1:1 to notification categories. [10]

Mapping Cadence's planned notification types:

| Cadence event | Courier modelling |
|---|---|
| Re-engagement nudge | Topic `re-engagement`, `OPTIONAL`, email + push routing |
| Course-completion nudge | Topic `course-progress`, `OPTIONAL`, email + in-app |
| Team Seat claiming | Topic `team-admin`, `OPTIONAL` or `REQUIRED` depending on legal need |
| Refund Request status | Topic `billing`, mark `REQUIRED` (transactional) |
| Team-member progression | Topic `team-activity`, `OPTIONAL`, in-app + email |

Each topic can have its own template(s) and routing rules. Journeys (automated multi-step sequences with delays and branching) are included on all plans, enabling re-engagement drip logic without additional tooling. [5]

There is no documented hard limit on the number of topics per workspace. Five categories is well within normal usage.

### 7. Integration shape

**Backend trigger (Node.js SDK):**

```ts
import Courier from "@trycourier/courier";

const client = new Courier({ authorizationToken: process.env.COURIER_API_KEY });

await client.send.message({
  message: {
    to: { user_id: "user-123" },
    template: "course-completion-nudge",
    data: { course_name: "React Fundamentals", instructor: "Jane" },
    routing: { method: "all", channels: ["inbox", "email"] },
  },
});
```

Authentication is a plain `pk_` Bearer token from an env variable — no OAuth dance, no webhook registration required for outbound sends. [10]

**Inbound webhooks:** Courier can POST delivery events (sent, opened, clicked, failed) to your server via outbound webhooks configured in the dashboard. [11] This enables Cadence to record engagement metrics without polling.

**React Router v7 integration pattern:**
1. Server loader mints a short-lived JWT using `@trycourier/courier` on the server.
2. JWT is passed to the client as loader data.
3. Client layout component (marked `'use client'`) initialises `useCourier()` and calls `auth.signIn({ userId, jwt })`.
4. `<CourierInboxPopupMenu />` and `<CourierToast />` are mounted in the root layout.

No server-sent events or WebSocket infrastructure needed from Cadence's side — Courier's SDK manages the real-time WebSocket connection to `wss://realtime.eu.courier.io`.

**DX quality signals:** The v9 SDK is a clean breaking-change release; prior packages (`@trycourier/react-inbox`, `react-provider`, etc.) are deprecated. Documentation is thorough with copy-paste-ready examples. The MCP server and CLI (included on all tiers) support local development and AI-assisted template authoring. [5]

## Sources

1. [Courier React SDK — courier.com/docs/sdk-libraries/courier-react-web](https://www.courier.com/docs/sdk-libraries/courier-react-web) — Component API, auth shape, React Router notes. Accessed 2026-11-18.
2. [In-App Notifications Overview — courier.com/docs/platform/inbox](https://www.courier.com/docs/platform/inbox/) — Inbox/toast/cross-channel fanout. Accessed 2026-11-18.
3. [Datacenters — courier.com/docs/workspaces/datacenters](https://www.courier.com/docs/workspaces/datacenters) — EU datacenter tier gating (Business+), endpoint URLs. Accessed 2026-11-18.
4. [EU Data Residency for Notifications — courier.com/blog/eu-data-residency-notifications](https://www.courier.com/blog/eu-data-residency-notifications) — Ireland datacenter, GDPR endpoints. Courier blog (vendor). Accessed 2026-11-18.
5. [Courier Pricing — courier.com/pricing](https://www.courier.com/pricing/) — Free tier (10K sends), Business ($0.005/send), Enterprise. Primary source. Accessed 2026-11-18.
6. [Notification Preferences Overview — courier.com/docs/platform/preferences/preferences-overview](https://www.courier.com/docs/platform/preferences/preferences-overview) — Per-topic, per-channel, REQUIRED override, tenant scoping. Accessed 2026-11-18.
7. [Build a Preference Center — courier.com/docs/guides/build-a-preference-center](https://www.courier.com/docs/guides/build-a-preference-center) — Hosted vs embedded, compliance notes. Accessed 2026-11-18.
8. [Push Notifications Overview — courier.com/docs/external-integrations/push/intro-to-push](https://www.courier.com/docs/external-integrations/push/intro-to-push) — FCM, APNs, no tier gating mentioned. Accessed 2026-11-18.
9. [Toast Messages & Web Push Guide — courier.com/blog/toast-messages-and-web-push-notifications](https://www.courier.com/blog/toast-messages-and-web-push-notifications-complete-guide-to-better-user) — VAPID/FCM for browser push. Courier blog (vendor). Accessed 2026-11-18.
10. [Courier Docs Welcome — courier.com/docs/welcome](https://www.courier.com/docs/welcome) — API key shape, Node SDK, template referencing. Accessed 2026-11-18.
11. [Webhook Integration — courier.com/docs/external-integrations/other/webhook-integration](https://www.courier.com/docs/external-integrations/other/webhook-integration) — Inbound/outbound webhook shape. Accessed 2026-11-18.

## Open questions

- **Exact web push (native VAPID) support without FCM.** Documentation describes FCM as the web push path. Whether Courier handles VAPID directly (without an FCM project) is not confirmed — requires a support query or testing.
- **Exact AWS region designation.** Docs say Ireland; whether this is `eu-west-1` or `eu-west-2` is not stated. Matters for customers with explicit AWS region requirements in their DPA.
- **Business plan DPA.** The pricing page lists DPA under Enterprise. It is unclear whether a Data Processing Agreement is available on the Business plan without a custom contract — relevant for EU B2B customers. Requires a direct query to Courier sales.
- **Topic count limits.** No documented cap on topics per workspace found. Assumed unlimited at the scale of ~5 categories.
- **Retention limits on the free tier.** No explicit message retention window documented for the Developer plan. Paid plans also not explicitly stated. Requires checking with Courier support.
