---
topic: Evaluate Knock (knock.app) as a notification service for Cadence
date: 2026-11-18
requested_by: user
related_tasks: [#4]
---

# Research: Knock Notification Service Evaluation for Cadence

## Question

Is Knock (knock.app) a suitable notification infrastructure provider for Cadence, a small React (React Router v7) video-course platform? Covers: in-app + email unified SDK, EU data residency, free tier limits, preference/opt-out centre, push support, trigger category modelling, and integration shape/DX.

## Summary

- Knock's workflow model delivers to multiple channels from a single trigger — email + in-app (and push, SMS, chat) are all steps in one workflow, not separate systems. This is a strong fit for Cadence.
- Free tier covers 10 k messages/month; Starter is $250/month flat for 50 k messages. At 1 k–10 k MAU with ~5 notification categories the free tier is likely sufficient at launch; growth into the low thousands of monthly active notified users stays on free until message volume tips over 10 k/month.
- Knock has no EU data residency region. It is GDPR-certified and participates in the EU-U.S. Data Privacy Framework (DPF), provides a DPA, is SOC 2 Type II certified — but all infrastructure is US-based. This is a material gap if Cadence targets EU-regulated customers.
- Preference centres are first-class: per-channel-type, per-channel-instance, per-workflow, and per-category opt-outs, with a hosted (no-code) option or a fully custom API-driven UI. Covers GDPR unsubscribe requirements including commercial vs. transactional distinction.
- All six Cadence trigger categories (re-engagement, course-completion, team-seat claiming, refund-request status, team-member progression, watched-seconds nudge) map cleanly onto Knock primitives — workflows with schedules, subscriptions, tenant-scoped triggers, and step conditions.

---

## Findings

### 1. In-App + Email in One SDK

Knock's core abstraction is the **workflow**: a DAG of channel steps. A single `knock.trigger()` call executes all steps in sequence (or in parallel if configured), so one trigger can produce an in-app feed message *and* an email *and* a push notification. Steps not relevant to a user (e.g. no push token registered) are skipped automatically [1][2].

**React in-app components** ship in `@knocklabs/react` (npm):

| Component | Purpose |
|---|---|
| `NotificationIconButton` | Bell icon with unseen/unread badge count |
| `NotificationFeedPopover` | Managed popover anchored to the bell |
| `NotificationFeed` | Full-page inbox / notification centre |
| Toast / alerts | Real-time ephemeral toasts via hooks |

All components sit inside two providers:

```jsx
<KnockProvider apiKey={process.env.KNOCK_PUBLIC_API_KEY} userId={user.id}>
  <KnockFeedProvider feedId={process.env.KNOCK_FEED_CHANNEL_ID}>
    <NotificationIconButton />
    <NotificationFeedPopover />
  </KnockFeedProvider>
</KnockProvider>
```

The library also exposes **headless hooks** for teams wanting fully custom UI while keeping Knock's real-time socket and state management. Real-time delivery uses a managed WebSocket — no polling [3][4].

Cross-platform SDKs: React, plain JS, React Native, Expo, iOS/Swift, Android/Kotlin, Flutter.

### 2. EU Data Residency

**No EU region exists.** Knock's infrastructure is US-based. What Knock does offer:

- SOC 2 Type II certification [5]
- GDPR "certification" (self-described; certifying body not named in public docs) [6]
- EU-U.S. Data Privacy Framework (DPF) adherence — covers lawful transfer of EU personal data to the US without SCCs per se [7]
- Published Data Processing Addendum (DPA) available at knock.app/legal/data-processing-addendum [7]
- Data encrypted at rest and in transit (TLS 1.2+)

**Risk for Cadence**: DPF adequacy covers most B2C cases. However, any EU customer that explicitly requires data to remain inside the EEA (e.g. public-sector, healthcare, some German enterprise contracts) cannot be served by Knock without supplemental SCCs and a risk acceptance — and even then the data physically leaves the EU. Competitors Courier and Novu offer actual EU-region endpoints [8] (secondary/vendor source — treat as directional).

Log retention: 30 days on Free and Starter; 90 days on Enterprise.

### 3. Free Tier Limits and Tier Landing

| Plan | Price | Messages/month | Log retention | Guide recipients |
|---|---|---|---|---|
| Free | $0 | 10,000 | 30 days | 500 |
| Starter | $250 flat | 50,000 (then $0.005/msg) | 30 days | 2,500 (then $0.05/ea) |
| Enterprise | Custom | Volume-based | 90 days | Custom |

**Message definition**: one message = one delivery to one user on one channel. A workflow with 2 channel steps (in-app + email) = 2 messages per trigger [1].

**Cadence sizing**: at 1 k MAU with ~5 notification categories and moderate engagement (say 3–5 notifications per active user per month), monthly message volume would be ~5 k–25 k messages. The free tier covers the low end; moderate growth hits Starter territory. Knock does **not** charge per MAU or per workflow trigger — only on delivered messages (and only on successful deliveries; bounced/preference-suppressed messages do not count) [1].

There is no concept of a mid-tier between Free ($0) and Starter ($250/month) — this is a noticeable cliff for a small but growing platform.

### 4. Preference / Opt-Out Centre

Knock's preference model is hierarchical and GDPR-grade [9]:

- **Per-channel-type**: e.g. opt out of all email globally
- **Per-channel-instance**: opt out of a specific email provider channel (by UUID)
- **Per-workflow**: opt out of a named workflow (e.g. "re-engagement-nudge")
- **Per-category**: opt out of a logical group of workflows

Evaluation order: more-specific preferences win over less-specific ones.

**Commercial vs. transactional distinction**: the `commercial_subscribed` preference key handles CAN-SPAM / GDPR commercial unsubscribe while preserving delivery of transactional messages (e.g. receipt, password reset) — this is exactly the right model for a course platform that sends both marketing nudges and service notifications.

**Delivery modes**:
1. **Hosted preference page** — Knock hosts it, accessible via signed URL, configured in the dashboard. Zero code required.
2. **Custom preference UI** — read/write preferences via API, full control over layout.

Both modes are available on all tiers (per-tenant branding overrides are Enterprise-only) [9].

### 5. Web Push + Mobile Push Support

**Mobile push**: Supported on all tiers, natively via APNs (iOS) and FCM (Android). Also supported via Expo, Amazon SNS, and OneSignal as intermediary layers [10].

**Web push**: Supported via FCM's web SDK. You collect the browser registration token using the Firebase JS client and store it as channel data on the recipient. Knock then routes through FCM to the browser. No dedicated "web push" channel separate from FCM — this means you need a Firebase project even for browser push [10][11].

**Tier gating**: No tier restrictions mentioned in push documentation. Channel groups (combining APNs + FCM into one logical push channel) are described as "enabled on-demand" via contacting support — this may indicate it is not self-serve on Free [10]. Single APNs or FCM channels appear to be self-serve on all tiers.

### 6. Trigger Category Modelling

All six Cadence notification categories map to Knock primitives:

| Cadence Category | Knock Primitive | Notes |
|---|---|---|
| Re-engagement nudge for lapsed student | **Schedules** (recurring or one-time) + step conditions | Schedule a workflow run; use a step condition to skip if user was recently active. Can be timezone-aware. |
| Course-completion nudge based on watched seconds | **Workflow trigger** from your backend when watched_seconds crosses threshold + **channel steps** | Your app emits the trigger; Knock handles multi-channel delivery. |
| Team Seat claiming events | **Tenant-scoped workflow trigger** | Pass `tenant` context on trigger; routes to correct workspace feed. |
| Refund Request status changes | **Workflow trigger** with `actor` (support agent) + `recipient` (customer) | Standard transactional pattern. |
| Team-member progression events | **Subscriptions** on a team object | Subscribe team members to a team object; trigger the workflow on the object to fan out to all subscribers. |
| (All categories) per-topic opt-out | **Workflow-level preferences** | User opts out of a workflow key; Knock evaluates before delivery. |

Schedules support recipient-timezone-aware execution (e.g. "9am in the user's timezone") [12]. Subscriptions handle fan-out without manually managing recipient lists [13].

### 7. Integration Shape and DX

**Authentication model**:
- `sk_*` secret keys for server-side API calls (trigger workflows, manage users, set channel data)
- `pk_*` public keys for client-side React SDK (safe to embed in browser bundle)
- Multiple keys per environment, immediate revocation, key rotation without downtime [14]

**Trigger API shape** (REST):
```
POST /v1/workflows/{workflow_key}/trigger
{
  "recipients": ["user_123"],
  "actor": "agent_456",
  "tenant": "org_789",
  "data": { "course_title": "...", "watched_seconds": 3600 }
}
```

**React Router v7 fit**: Knock has no React Router-specific integration. The pattern is:
- Server action / loader calls Knock's Node SDK (`@knocklabs/node`) to trigger workflows
- Client components mount the `@knocklabs/react` providers anywhere in the component tree (e.g. in the root layout)
- No dedicated worker or long-running process needed — Knock's infra handles delivery

**Other integration points**:
- Source events (Segment, etc.) can trigger workflows — useful if Cadence later adopts an event pipeline
- Webhooks: Knock can emit outbound webhooks on notification events (sent, delivered, bounced, seen, read) — useful for analytics
- No inbound webhook endpoint required on the Cadence side unless you want delivery receipts

**DX quality** (from docs + community signals): The dashboard visual workflow builder, pre-built React components, and clean REST API are consistently cited as strengths. The jump from free to $250/month is the most common friction point for small teams. Official Node, Python, Ruby, Go, Java, .NET SDKs exist [1][3][14].

---

## Sources

1. [Knock Pricing](https://knock.app/pricing) — Primary: all tier limits, message definition, overage pricing. Fetched 2026-11-18.
2. [Knock Concepts: Channels](https://docs.knock.app/concepts/channels) — Channel types list; multi-channel workflow model. Fetched 2026-11-18.
3. [Knock React In-App UI Overview](https://docs.knock.app/in-app-ui/react/overview) — Component list, provider setup, headless hooks. Fetched 2026-11-18.
4. [Knock Inbox Component](https://docs.knock.app/in-app-ui/react/inbox) — Full-page inbox code example. Fetched 2026-11-18.
5. [Knock SOC 2 Announcement](https://knock.app/blog/announcing-our-soc-2-certification) — SOC 2 Type II certification details. Fetched via search 2026-11-18.
6. [Knock GDPR Announcement](https://knock.app/blog/gdpr-announcement) — GDPR certification claim; no certifying body named. Fetched 2026-11-18.
7. [Knock Data Processing Addendum](https://knock.app/legal/data-processing-addendum) — DPA, DPF adherence, EU-U.S. transfer mechanism. Fetched via search 2026-11-18.
8. [Courier: EU Data Residency for Notifications](https://www.courier.com/blog/eu-data-residency-notifications) — Competitor comparison, EU region availability. Vendor source. Fetched via search 2026-11-18.
9. [Knock Preferences Overview](https://docs.knock.app/preferences/overview) — Per-channel, per-workflow, per-category opt-outs; hosted vs custom preference centre. Fetched 2026-11-18.
10. [Knock Push Integrations Overview](https://docs.knock.app/integrations/push/overview) — APNs, FCM mobile + web push. Fetched 2026-11-18.
11. [Knock Firebase Integration](https://docs.knock.app/integrations/push/firebase) — FCM web push token format and setup. Fetched 2026-11-18.
12. [Knock Schedules](https://docs.knock.app/concepts/schedules) — Recurring/one-off schedules, timezone-aware execution. Fetched 2026-11-18.
13. [Knock Subscriptions](https://docs.knock.app/concepts/subscriptions) — Object-subscriber fan-out model. Fetched 2026-11-18.
14. [Knock API Keys](https://docs.knock.app/developer-tools/api-keys) — pk/sk key model, rotation, revocation. Fetched 2026-11-18.

---

## Open Questions

1. **EU data residency roadmap**: Knock does not publish a roadmap for an EU region. If Cadence expects EU enterprise customers, this needs a direct answer from Knock's sales team.
2. **Free tier MAU ceiling**: Knock's pricing is message-based, not MAU-based, but "Guide" features (banners, modals) use a 500 active-user cap on Free. If Cadence uses in-product guides (not just feed/email), this is a binding limit.
3. **FCM web push — Firebase requirement**: Web push requires a Firebase project. If Cadence doesn't already use Firebase, this adds operational overhead. Worth checking whether Knock plans a first-party web push channel (VAPID-based) without FCM dependency.
4. **$0 → $250 cliff**: There is no intermediate tier. The jump from free to Starter at $250/month is steep for an early-stage platform. Knock's sales team should be asked whether annual prepay or a growth plan exists.
5. **Channel groups on Free**: Whether combining APNs + FCM into one logical push channel (channel groups) is self-serve on Free, or requires contacting support, was not fully confirmed in public docs.
