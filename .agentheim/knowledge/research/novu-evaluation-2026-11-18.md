---
topic: Novu as notification service for Cadence (React Router v7 video-course platform)
date: 2026-11-18
requested_by: user
related_tasks: [#6]
---

# Research: Novu Notification Service Evaluation

## Question

Should Cadence (small React Router v7 video-course platform) use Novu — either Novu Cloud or self-hosted — as its notification infrastructure? Evaluate across: in-app+email unified SDK, EU data residency, free-tier/self-hosting costs, preference/opt-out centre, push channels, trigger modelling, and integration shape/vendor risk.

---

## Summary

- **One workflow, two channels: yes.** A single Novu workflow can emit an in-app step and an email step sequentially, with optional delay/condition branching (e.g. send in-app, wait 24 h, send email only if unread). The `@novu/react` Inbox component slots straight into React.
- **EU data residency is a first-class feature on all paid tiers.** Frankfurt (eu-central-1) endpoint is available from Free upward; self-hosting fully resolves it at the cost of running your own infra (MongoDB + Redis + three Node services + S3).
- **Free Cloud tier is tight for a growing course platform (10 K workflow-runs/month, 5 workflow limit, 24–48 h activity retention, no SSO/RBAC).** Self-hosting is free to license but non-trivial to operate: single-VM minimum is ~4 vCPU / 8 GB RAM; production multi-VM is substantially more.
- **Preference centre is built-in and GDPR-adequate.** Three-layer hierarchy (workflow default → subscriber global → per-workflow), per-channel granularity, topic-level subscriptions (Jan 2026), and "critical workflow" flag for non-opt-out notifications. All exposed through the Inbox component UI without extra code.
- **Licensing is "open core" with caveats.** Core is MIT but enterprise/cloud features (Inbox snooze, SSO, RBAC, email tracking, branding removal) live behind a proprietary licence. Self-hosters on the community edition lose those features; they cannot fork and unlock them freely. Active project (40 K stars, 2 275 commits in 12 months, last release Aug 2026).

---

## Findings

### 1. In-app + email in one SDK

Novu's core abstraction is the **workflow**: a code-defined or no-code sequence of channel steps. The docs explicitly show the canonical multi-channel pattern: "Send an in-App message → Wait 24 hours → If in-app message is unread, send an email." [1][2] Both steps live in one workflow definition; one trigger call drives both.

The **`@novu/react` Inbox component** (`<Inbox />`) is a plug-and-play React 18/19 component that handles real-time delivery, unread counts, read/unread state, and the subscriber preference UI. It accepts `applicationIdentifier` and `subscriberId` props, plus an optional HMAC `subscriberHash` for production security. Hooks (`@novu/react`) and framework-agnostic primitives (`@novu/js`) are available for fully custom UI. [3]

The **Novu Framework SDK** (`@novu/framework`) lets you define workflows in TypeScript with a `workflow()` function; steps are `step.email()`, `step.inApp()`, `step.push()`, etc. with typed payload schemas. This is the "code-first" path, preferred for Cadence's developer workflow. [4]

### 2. EU data residency

Novu Cloud maintains a **dedicated EU region** in AWS Frankfurt (eu-central-1). Dashboard: `eu.dashboard.novu.co`; API: `https://eu.api.novu.co/v1`; WebSocket: `wss://eu.socket.novu.co`. Available on all subscription tiers (Free → Enterprise). [5]

Data is strictly region-isolated: "you can't copy or move data between US and EU data warehouses." API keys are bound to the region at account creation; cross-region calls return 401. Region migration requires contacting sales. [5]

A **DPA and SCC template** are downloadable at `novu.co/dpa`. Novu holds SOC 2 Type II and ISO 27001. HIPAA BAA is Enterprise-only. [5]

**Self-hosting** fully sidesteps the question — all data stays in whatever infrastructure you deploy to. The community edition self-host does not include Novu's compliance certifications, so you are responsible for your own GDPR posture, but the data never leaves your control. [6]

### 3. Free tier limits and self-hosting costs

**Novu Cloud tiers** (from official pricing page, Nov 2026): [7]

| Plan       | Price        | Workflow runs/mo | Workflows | Environments | Activity retention | Push/Web Push |
|------------|-------------|-----------------|-----------|--------------|-------------------|---------------|
| Free       | $0           | 10 K            | 5         | 2            | 24–48 h           | All channels  |
| Pro        | From $30/mo  | 30 K            | 20        | 2            | 48 h              | All channels  |
| Team       | From $250/mo | 250 K           | 100       | 10           | 90 days           | All channels  |
| Enterprise | Custom       | 10 M+           | Unlimited | Unlimited    | Custom            | All channels  |

Overage on Pro/Team: $1.20 per 1 K additional runs. Free tier hard-stops at 10 K; no credit card required. The **5-workflow cap on Free** is a real constraint for Cadence — each of re-engagement, completion nudge, seat-claiming, refund status, and progression is likely its own workflow. [7]

**Self-hosting infrastructure shape** (from official self-hosting docs): [8]

- **Services**: API server, Worker, WebSocket server, Dashboard (all Node.js 22)
- **Database**: MongoDB (cluster M20+ recommended for production; single-VM: 2 GB RAM, 20 GB disk)
- **Queue/cache**: Redis 8 (two clusters in production, 8 GB RAM each; AOF persistence required for queue cluster)
- **Storage**: S3-compatible (10 GB minimum) for attachments
- **Single-VM minimum**: 4 vCPU, 8 GB RAM running all services + MongoDB + Redis
- **Production multi-VM**: 3× API + 3× Worker + 3× WS (each 2 vCPU, 4 GB) + 1× Dashboard + Redis clusters + MongoDB Atlas M20

A rough single-VM self-host on a cloud provider (e.g. €30–50/mo for a suitable instance) plus managed MongoDB Atlas (~$57/mo for M20) and Redis (~$10–20/mo) puts minimum self-hosting at **~€80–120/mo** before any HA. That is likely more expensive than Novu Cloud Pro ($30/mo) for Cadence at early scale. The operational overhead (upgrades, security patches, monitoring) is additional.

Notably, **ClickHouse** was mentioned in one secondary source as a dependency for analytics telemetry but was not listed in the official self-hosting overview. This discrepancy is a single-source claim (secondary blog) and should be verified against the official `docker-compose.yml` before provisioning.

### 4. Preference / opt-out centre

Novu implements a **three-layer preference hierarchy** with the most-specific layer winning: [9]

1. **Workflow channel defaults** (set in dashboard/code; all channels on by default)
2. **Subscriber global preferences** (opt out of a channel entirely across all workflows)
3. **Subscriber per-workflow preferences** (override for a specific workflow)

The Inbox component surfaces a built-in `Preferences` sub-component; subscribers can toggle channels per workflow directly in the UI without custom code. Only channels that have active steps in a workflow appear as toggleable options.

**Critical workflows** (account verification, password reset) can be flagged `critical: true` in code, which hides them from the preference UI entirely — subscribers cannot opt out. [9]

**Topic-level subscriptions** (launched Jan 2026) add a `Subscription` component giving per-topic control — relevant if Cadence groups users by cohort or course team. Each subscriber can have multiple subscriptions on the same topic with different JSON Logic conditions. [10][9]

For GDPR purposes: opt-out state is stored per subscriber in Novu's data store; self-hosting keeps that data under your control. Cloud self-serve subscriber data export and deletion via API is documented. The preference system itself is GDPR-adequate in design (explicit per-channel, per-workflow consent/refusal; critical-workflow carve-out is legitimate-interest territory for security notifications). [9]

### 5. Web and mobile push

Push is listed as a supported channel on **all tiers including Free** — there is no tier-gating on push channel access. [7]

Novu integrates with push providers including **Firebase Cloud Messaging (FCM)** for Android/web, **APNS** for iOS, and **Expo** for React Native. Web push (browser-level) is delivered through FCM. [11] You bring your own push provider credentials; Novu routes the notification through its workflow engine and your provider.

For the community (self-hosted) edition, push is fully available — there is no cloud-only restriction on the push channel type. The only push-related feature gap in self-hosted is the Inbox snooze feature (in-app channel, not push per se) and email engagement tracking. [6]

**Single-source caveat**: the specific provider list (FCM, APNS, Expo) comes from a secondary search result aggregating Novu's integrations page. The primary Novu docs confirmed "push" as a channel but did not enumerate providers in the pages fetched. Treat the specific provider list as directionally accurate but verify against the Novu integrations store before committing.

### 6. Trigger categories — modelling Cadence's use cases

Novu workflows are triggered by any server-side event via `POST /v1/events/trigger` with a `workflowId`, `to` (subscriberId or topic), and free-form `payload`. There is no concept of a fixed trigger-type catalogue; triggers are arbitrary named events you define. [12]

This means all of Cadence's intended trigger categories map cleanly:

| Cadence event | Novu modelling |
|---|---|
| Re-engagement (inactive user) | Scheduled/batch trigger to a topic of inactive subscribers; delay steps for multi-touch |
| Completion nudge | Trigger on course-progress event; conditional step (% complete < threshold) |
| Team Seat claiming | Trigger on `team.invite.sent`; in-app + email workflow with delay fallback |
| Refund Request status | Trigger on `refund.status.changed`; payload carries `status`; conditional email step |
| Team-member progression | Trigger on `progress.milestone`; in-app notification + optional email digest |

Delay steps (absolute or relative), conditional steps (evaluate payload/subscriber data), and topic fan-out are all available in the community edition. [1][9]

### 7. Integration shape, React Router v7 fit, DX quality, vendor risk

**Trigger from server**: Standard REST `POST https://api.novu.co/v1/events/trigger` with `Authorization: ApiKey <NOVU_SECRET_KEY>`. Node SDK: `@novu/api` with `novu.trigger({ workflowId, to, payload })`. Secret key stays server-side — route actions and loaders in React Router v7 framework mode are the natural place for this call. [12]

**React Router v7 / Remix server route for Framework SDK**: An `app/routes/api.novu.ts` file exports `action` and `loader` using `serve()` from `@novu/framework/remix`. This serves workflow definitions to the Novu Cloud tunnel during development (`npx novu dev`) and to the Novu sync endpoint in production. This is a first-class integration pattern Novu documents explicitly. [13]

**Client SDK**: `@novu/react` renders `<Inbox />` on the client; no server involvement needed beyond providing the `applicationIdentifier` (public) and a HMAC-signed `subscriberHash` (computed server-side). This fits a React Router v7 loader returning those values to a client component.

**DX quality**: The workflow-as-code approach via `@novu/framework` is clean TypeScript with schema validation. The `npx novu dev` tunnel for local preview is a genuine DX win — no need to deploy to test notification templates. The REST trigger API is simple and well-documented.

**Vendor risk / licensing**: This is the most significant concern. Novu markets itself as open source (MIT) but operates an **open-core model**. Features including Inbox snooze, email delivery tracking, branding removal, SSO, RBAC, and audit logs are under a **Novu Proprietary Software Licence**, not MIT. The community edition MIT code has dependencies on proprietary components, meaning self-hosters cannot freely fork the missing enterprise features. [14]

The project is actively maintained (40 K GitHub stars, 2 275 commits in 12 months, last release Aug 2026, funded by VC) with no indication of imminent sunset risk [15]. But the licence situation means:
- Self-hosted community edition is a viable, free-to-run choice for Cadence's core needs (all channels, workflows, preferences, topics are MIT-licensed).
- If you later need Inbox snooze, email engagement tracking, or SSO you must either move to Novu Cloud or negotiate an enterprise licence; you cannot build it yourself from the OSS repo.
- Cloud lock-in risk is moderate: the trigger API and workflow definitions are portable; the Inbox component is replaceable with any UI reading Novu's subscriber notifications API. Migrating away is painful but not impossible.

---

## Sources

1. [How do workflows work in Novu?](https://docs.novu.co/platform/concepts/workflows) — Workflow architecture, multi-channel step sequencing, delay/condition branching. Primary (official docs).
2. [What is Novu?](https://docs.novu.co/platform/what-is-novu) — Platform overview, channel list. Primary (official docs).
3. [Novu Inbox — In-App Notification Component for React](https://docs.novu.co/platform/inbox) — Inbox component API, props, customisation levels, preference UI. Primary (official docs).
4. [Novu Framework Introduction](https://docs.novu.co/framework/introduction) — TypeScript workflow definition SDK. Primary (official docs).
5. [Security and Compliance — Novu](https://docs.novu.co/platform/additional-resources/security) — EU region endpoints, GDPR, DPA/SCC, SOC 2, ISO 27001. Primary (official docs).
6. [Self-Hosted and Novu Cloud](https://docs.novu.co/community/self-hosted-and-novu-cloud) — Feature gap matrix between community and cloud. Primary (official docs).
7. [Novu Pricing](https://www.novu.co/pricing/) — Official tier table, run limits, channel inclusion, data residency per tier. Primary (official pricing page). Retrieved Nov 2026.
8. [Self-Host Novu — Overview](https://docs.novu.co/community/self-hosting-novu/overview) — Infrastructure components (services, MongoDB, Redis, S3), resource requirements, single-VM vs multi-VM. Primary (official docs).
9. [Preferences — Novu](https://docs.novu.co/platform/concepts/preferences) — Three-layer preference hierarchy, critical workflows, tenant-aware storage, API access. Primary (official docs).
10. [Topics — Novu](https://docs.novu.co/platform/concepts/topics) — Topic subscriptions, JSON Logic conditions, fan-out behaviour. Primary (official docs).
11. [Push Notification API Comparison 2026](https://api-catalog-three.vercel.app/compare/push-notification-api) — Novu push provider list (FCM, APNS, Expo). Secondary; treat provider list as directional.
12. [Trigger Workflow — Novu](https://docs.novu.co/platform/workflow/trigger-workflow) — REST trigger endpoint, SDK usage, secret key handling. Primary (official docs).
13. [How to send notifications with Remix and Novu Framework](https://docs.novu.co/framework/quickstart/remix) — Remix / React Router v7 server route integration (`@novu/framework/remix`). Primary (official docs).
14. [Novu: Is it really FOSS?](https://isitreallyfoss.com/projects/novu/) — Licence analysis: MIT vs proprietary components, dependency entanglement. Independent analysis. Retrieved Nov 2026.
15. [Novu Health, Licence & Alternatives (2026)](https://ideaproof.io/open-source/project/novu) — Health score, commit velocity, funding, vendor risk flags. Secondary aggregator. Retrieved Nov 2026.
16. [Billing — Novu](https://docs.novu.co/platform/account/billing) — Tier limits, overage pricing, free tier behaviour. Primary (official docs).

---

## Open questions

1. **ClickHouse dependency**: One secondary source lists ClickHouse as a self-hosting dependency for analytics. The official self-hosting overview does not mention it. Verify by inspecting `novuhq/novu` `docker-compose.yml` on GitHub before finalising infra sizing.
2. **Free tier EU region confirmation**: Pricing page says EU available on all tiers; the security page confirms Free → Enterprise. Worth a quick account-creation test to confirm the Frankfurt endpoint is reachable on a free account without hitting a paywall prompt.
3. **Activity retention on Free (24–48 h)**: This is very short for debugging. Confirm whether the billing page definition of "activity" covers workflow run logs or only email-open/click events — it affects operational observability on the free plan.
4. **Proprietary licence scope**: The boundary between MIT and proprietary code is not clearly documented by Novu. Before committing to self-hosting, review the `LICENSE` files in the `novuhq/novu` monorepo subdirectories to map which packages are proprietary.
5. **React Router v7 `loader` vs `action` for the Bridge endpoint**: The Remix quickstart shows both `action` and `loader` exported from the bridge route. React Router v7 framework mode may require a `headers` export for the OPTIONS preflight Novu dev-tunnel uses. Needs a quick smoke-test.
