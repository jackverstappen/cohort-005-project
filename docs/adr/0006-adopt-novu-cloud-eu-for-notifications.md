# Adopt Novu Cloud EU as Cadence's notification service

Cadence will use **Novu Cloud (Frankfurt / EU region)** to deliver in-app and email notifications to Students and Team Admins. One Novu workflow drives both channels per trigger category (re-engagement, course-completion, Seat claim, Refund Request status, team-member progression). The React in-app surface is Novu's `<Inbox />` component from `@novu/react`, wired through `@novu/framework/remix` to Cadence's React Router v7 app.

EU data residency is the deciding axis: Novu is the only one of the three evaluated services (Novu, Courier, Knock) that offers an EU region on every tier, including Free. This matters because Students and Team Admins include EU residents under GDPR, and residency should not be gated behind a $250–300/month paid tier before Cadence has revenue to justify it.

## Considered Options

- **Knock.** Rejected: US-only infrastructure. GDPR-certified with a DPA and EU-US DPF transfers, but no EU region. Fails the residency filter outright, independent of its strong DX and pricing.
- **Courier.** Rejected: EU region (`api.eu.courier.com`) is Business+ only — roughly $300/month at 5k MAU with per-send pricing. Forces a paid plan before launch purely for residency, and per-send pricing scales linearly with growth.
- **Self-hosted Novu (community edition).** Rejected for now: full EU control and no per-user cost, but ~€80–120/month cloud infra (DB + Redis + workers) plus operational burden, and **permanently locked out of** proprietary features — Inbox snooze, SSO, email tracking, RBAC, branding-removal — which only ship in Novu Cloud. Kept as the exit strategy if Novu Cloud pricing, licence, or ownership shifts unacceptably.

## Consequences

Notification workflows become a hosted dependency: trigger definitions, subscriber data, and preference state live in Novu's EU region, not in Cadence's database. Migrating away later means rebuilding the workflow catalogue and backfilling subscribers into whichever replacement comes next, so the choice is sticky.

The Free tier's 5-workflow cap exactly matches Cadence's five trigger categories — a tight fit with no headroom for a sixth. Adding any new category forces an upgrade to Cloud Pro ($30/month, 20 workflows, 30k runs), which also unlocks the proprietary features above. Features that depend on snooze, SSO, email tracking, RBAC, or custom branding should assume Pro, not Free.

Related research:

- `.agentheim/knowledge/research/novu-evaluation-2026-11-18.md`
- `.agentheim/knowledge/research/courier-evaluation-2026-11-18.md`
- `.agentheim/knowledge/research/knock-evaluation-2026-11-18.md`
