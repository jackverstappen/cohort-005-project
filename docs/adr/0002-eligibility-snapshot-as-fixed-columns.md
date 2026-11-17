# Eligibility Snapshot stored as three fixed columns, written once at request time

On Refund Request creation we snapshot three values onto the `refunds` row: `watchedHoursAtRequest`, `daysSincePurchaseAtRequest`, `seatsClaimedAtRequest`. Written once, never updated. Everything else shown to the admin (rating, prior refunds, progress, comments) is live-queried.

We considered a JSON `snapshot` column and a side table `refund_eligibility_snapshots`. JSON hides schema and makes these values awkward to query for reporting; a side table is overkill for a fixed set of three scalars that always exist for every Refund Request. Three explicit columns are stable, queryable, and self-documenting.

Writing once (vs refreshing while the request is Open, or re-snapshotting at resolution) is the whole point: the snapshot records the state the decision was made against. Refreshing it would defeat the audit purpose and let the numbers drift under the admin's feet mid-review.

## Consequences

- Schema change on `refunds`: three non-null columns — `watched_hours_at_request` as `real`, `days_since_purchase_at_request` and `seats_claimed_at_request` as `integer`.
- Admin UI reads these columns for the "at time of request" block; reads live tables for everything else in Learner History.
