# P6-P9 Release Record

Branch `p6-p9`, closed 2026-10-08. Governing scope: the four September 15
specifications; plans `2026-10-04-p6-disputes-returns.md` (31 tasks) and
`2026-10-04-p7-delivery.md` (32 tasks); P8/P9 audited against their specs
directly (their plan files are stubs). This record supersedes the
continuation ledger `2026-10-05-p6-p9-execution-status.md`, whose remaining
critical path is now complete.

## What ships

- **P6 disputes & returns**: the full case machine (returns, disputes,
  evidence with visibility walls, arbitration with the moderator ladder,
  strikes and risk signals, commission credits in series A, the overdue and
  silence sweeps), on both clients plus the web moderation workspace.
- **P7 delivery**: zones/locations/couriers as data, zone quotes behind
  `zonesEnabled` with the flat fallback, shipments with a single transition
  writer, rider links (`/r/{token}`, minimal projection), proof photos with
  per-shipment ownership checks, the eight delivery jobs on the `delivery`
  queue, seller/dispatcher/buyer surfaces on both clients. Couriers are
  hexagonal: port + fake + registry refusal; the `yango` adapter is a
  placeholder and its env vars stay unset.
- **P8 resale**: the full reseller domain, now integrated at checkout (a
  real resale checkout writes the sourcing trio and ships from the
  supplier) and visible to the ledger (`reseller_commission_payable`,
  `reseller_payout_in_transit`). Resale is COD-only while
  `resale.prepaidEnabled` is off (spec l.422). Mixed carts refuse
  `cart.singleFulfilment`.
- **P9 insights & fraud**: stats, risk flags and actions, the weekly seller
  insights digest on the `insights` queue.

## Gates at close

API 294 files / 4194 tests (the load-flaky route trio passes 55/55 serially
and two fully green quiet runs preceded the close); web 752; mobile 791;
0 TS errors. Ceilings re-measured and republished: `check-types:tests`
105→**100**, api `as never` **86**, client casts 78→**77**, mobile advisory
**35** (fresh router types). Reviews: a checkpoint (2 blocking + 7
should-fix, all fixed), a final whole-branch review (APPROVED; its 4
should-fix fixed and re-reviewed ALL CLOSED).

## Deploy obligations

1. Run migrations, including `20261008_000000_p6_credit_note_index`
   (without it a shop's second series-A credit note collides).
2. Re-run `syncNotificationWorkflows` — three new workflows
   (`shipment-pickup-reminder`, `shipment-late`, `shop-weekly-insights`).
3. The `delivery` and `insights` job queues autoRun on UTC crons (the
   scheduler has no timezone; Douala times are written as UTC).
4. Keep `yango` adapter env vars unset and **reseller payouts disabled**
   until the S-4 residual's companion (V-11) is decided.
5. The P5 obligations (NotchPay keys, payment gates) are unchanged.

## Open decisions — the user's

- **V-1..V-11** in `.superpowers/sdd/2026-10-04-p6-disputes-returns/final-review.md`:
  7 copy vetoes (the agent-authored Delivery namespace, ModerationDisputes
  copy, P6 error sentences), 3 product choices (legacy-button keep-vs-hide
  default, rider role surface, shop push links without mobile screens),
  1 spec amendment (the P8 settlement-cash ledger account).
- The P5 user gates (U-1..U-12, staging nights, seller payment terms) still
  stand — see `2026-10-03-p5-release-record.md`.

## Known accepted residuals

Recorded with their rulings in the SDD ledger: the reseller
complete-after-cut overpayment (recorded, reconcile flags it, payouts off);
the protected partial-refund cap (stricter than spec, consistent); the
load-flaky route-spec trio (import contention — a warm-up or import-cost
work item, never a timeout raise); risk-flags digest + staff topic await
topic infrastructure.
