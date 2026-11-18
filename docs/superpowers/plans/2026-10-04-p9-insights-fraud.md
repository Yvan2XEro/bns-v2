# P9 Seller Insights and Fraud Implementation Plan

Binding specification: `docs/superpowers/specs/2026-09-15-p9-insights-fraud-design.md`.

P0-P5 are implemented. P6-P8 are being completed on the same feature branch in isolated worktrees. Consume their published contracts; do not invent duplicate business rules or collection types. Existing repository rules apply to every task. No commits are authorized by this execution request.

## Dependencies and Integration

- P6 owns the risk signal outbox and its transactional producer. P9 consumes it without changing the producer's contract.
- P8 owns resale commission holds and resale moderation actions. Bind them through their exported services after integration.
- Extend the existing API `lib/rateLimit.ts`; its current callers and injected `CounterStore` test doubles remain compatible.
- Integrate shared `AppSettings`, Payload registration, moderation, notifications, and locale changes sequentially. Regenerate Payload types after the final collection changes.
- Keep all risk and insights switches disabled by default. Counting and aggregation run independently of insights visibility.
- Never store raw phone numbers or installation identifiers in counter keys, flags, evidence, or logs. Risk records remain staff-only.
- Tests use the in-memory Payload fake, not the live database. A fake cannot prove a real Mongo partial index; provide the index migration and clearly distinguish its tests.

## Tasks

1. [ ] Extend shared rate counters with atomic expiry, distinct counting, outage handling, and a safe exceeded hook. Verify fixed window boundaries, distinct members, expiry, and fail-open behavior. Make chat message counters atomic as well.
2. [ ] Add feature settings and shared error codes with English/French client translations. Test default-off behavior and public config exposing only `insightsEnabled`.
3. [ ] Add `shop-daily-stats` and staff-only `risk-flags`, required field access, retention dates, compound indexes, and generated types. Test member permissions and service-only writes.
4. [ ] Add installation identifiers to both API clients, secure keyed hashing server-side, the public view route, and a service-only guard on `listings.views`. Replace the web counter and wire mobile views. Test dedupe, owner/member exclusion, publication checks, limits, and day boundaries.
5. [ ] Implement response bursts and shop aggregation over existing events, with ratios calculated from summed values, idempotent view flushing, recomputation of the last three days, and inventory snapshots only for yesterday. Test exact fixtures, late events, repeat runs, and cost privacy.
6. [ ] Implement seller insights service, permission-checked route, periods, deltas, funnel, rates, response buckets, top products, restock and at most four actionable recommendations. Test denominator thresholds and deterministic action priority.
7. [ ] Implement risk signal recording, open-flag upserts, repeat score bumps, related flags, owner/shop escalation and gated reversible automatic effects. Test thresholds and absence of personal data paired with expected evidence values.
8. [ ] Connect inline signals, velocity limits, outbox consumption and nightly ratio evaluation. Business writes commit before inline signals; failures never undo commerce. Test retries, deduplication and pre-P9 outbox consumption.
9. [ ] Implement moderation outcomes, allowed action/subject combinations, existing sanction delegation, false-positive reversal, queue/detail routes and summary counts. Test ranks, transitions, note requirements and audit metadata.
10. [ ] Implement retention and account deletion handling; add the backfill entry point using the same aggregator. Test all retention boundaries and stale-open closure.
11. [ ] Add weekly seller summaries, staff high-risk and digest workflows, topic membership on role changes, and every scheduled job. Test recipient privacy, notification throttling and job idempotency.
12. [ ] Build web insights, the seller dashboard summary, and the Payload risk queue using resource hooks and translated actionable copy. Preserve the established visual system and cost permissions.
13. [ ] Build mobile insights, seller hub summary and moderation risk screens, hook contracts and route/deep-link registrations. Use typed FlashLists and translated forms.
14. [ ] Run the API, web, mobile and chat suites with the correct runners, formatting and type checks. Measure advisory ceilings on the quiet integrated tree and review all cross-phase contracts. Record staging-only checks as pending rather than claiming they ran.

## Verification

Each behavior-changing task starts with a failing test that asserts an observable value. Targeted tests run while implementing; full suites run sequentially after integration to avoid contention. The release record must separate verified local code from staging backfill, physical-device checks, and production flag enablement.
