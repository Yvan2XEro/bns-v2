# P6-P9 Execution Status

This is a continuation ledger, not a release approval. The governing scope is
the four September 15 specifications and October 4 implementation plans.
Branch: `p6-p9`. Last committed baseline: `5401501`.

## Progress Reporting

The previously communicated 65% is a provisional estimate, not an audited
task-completion percentage. Do not present P7 or P8 as complete merely because
P9 files exist. Completion requires the remaining integration work, all
verification gates, and the release records required by each plan.

## Verified Work in This Continuation

- P6 seller return inspection and direct-refund forms exist on both clients,
  using one shared Zod contract and React Hook Form. Inspection requires an
  explicit outcome; positive deductions require a note and uploaded evidence,
  respect the original item value and cannot charge a non-conformity return.
- Refund uploads use `payment_proof`, not `photo`. Mobile uploads use Expo
  `File` with the existing upload transport. Protected-payment fallback to
  `seller_direct` exposes the seller proof action; provider refunds do not.
  The regression was observed failing, then passing in the lifecycle spec.
- P6 mobile return detail no longer shows an error empty state during loading,
  duplicates the pickup action, or offers a return-method change the server
  cannot apply. Return translations are in their correct namespaces.
- P7 zone quotes now replace flat quotes only when `zonesEnabled` is on.
  Whole-city fallback and district specificity, exact free-above boundaries,
  minimum subtotals, COD restrictions and intercity feature gating have tests.
  The old flat body remains behind the switch.
- P7 checkout re-quotes at placement, stores zone/location/ETA snapshots and
  rejects stale zone revisions. Flat-mode quote hashes retain their old input.
- Both clients consume the same delivery option type and show promised dates,
  waived fees and unavailable-method hints. Payment method selection is
  available before delivery selection, avoiding an unreachable protected-only
  delivery option. COD restrictions do not disable protected options.
- Pickup readiness accounts for opening hours and carries preparation time
  over to the next opening. A courier delivery requires an address landmark
  consistently on API, web and mobile; a parity test caught and pinned this.

## Verification Evidence

- Return schemas, lifecycle, arithmetic and refunds: 47 passing API tests.
- Zone/flat quotes, checkout quote/place and hash: 92 passing API tests before
  the additional placement snapshot cases; the later placement run has 33 cases.
- Checkout placement/mobile-money/delivery route: 46 passing API tests.
- Latest focused return, calendar, zone, placement and form parity run:
  6 files, 121 tests passing.
- Complete web suite: 585 passing, zero failures.
- Complete mobile suite: 703 passing, zero failures.
- Web source typecheck passed after shared delivery types were introduced.
- API source typecheck passed after the initial zone integration; rerun after
  the final changes and client integrations.
- Mobile advisory typecheck with regenerated Expo route types: 35 errors,
  matching the documented ceiling. Sharing generated collection types needs
  the mobile Payload augmentation shim, not the server runtime dependency.
- API test typecheck initially reported 176 errors. The October 6 continuation
  reduced this to 100, below the 105 ceiling, without adding casts. Generated
  collection fixtures are accepted as objects and copied into the fake's plain
  document store; Payload schema assertions narrow data-affecting fields;
  notification/SMS mocks use the real function signatures and hoisted factories.
- First full API run: 279 files, 4024 tests, one failure in the newly extended
  courier-address parity case. The fix passed the focused run; a fresh full
  run is still required before claiming the whole suite passes.
- Client `as never` raw occurrence count: 78. API raw count was 87 because
  one new test description contained the measured phrase; rewording that
  description restores 86. This does not remove an actual cast or repair a
  type error. New schemas and forms introduce no casts.

## Remaining Critical Path

1. Finish P6 seller disputes/standing, evidence and decision workflows and the
   web moderation workspace against the plan, including permissions and copy.
2. Implement the remaining P7 web/mobile client tasks on this checkout, then
   verify routes, navigation, permission/flag gates, rider links and shipment
   actions together. The isolated worker patches are unavailable.
3. Finish P7 estimate presentation in listing/shop pages and the remaining
   quote edge cases. The public endpoint and versioned cache are implemented
   and tested below. Verify supplier fulfillment at the P8 checkout seam.
4. Audit P8 checkout, purchase-order creation and financial/refund seams against
   the spec. The existence of resale services or passing isolated specs alone
   is not proof that the buyer checkout is integrated.
5. Audit P9 job registration, statistics retention/backfill, fraud actions and
   notification/summary wiring against every required plan task.
6. Preserve the now-restored API test-type ceiling, rerun all suites on the integrated quiet
   tree, regenerate Payload types if collections change, check all four
   ceilings and review the full branch before committing validated batches.
7. Record staging-only acceptance steps separately. Do not run smoke tests
   against the configured live database accidentally or claim real-phone,
   courier or provider staging verification from fake integration tests.

## Isolated P7 Workers

- Web worker: `/tmp/bns-p7-web-final`.
- Mobile worker: `/tmp/bns-p7-mobile-final`.
- Their starting dirty snapshot was staged as a baseline. Integrate only their
  unstaged binary delta, not a diff against HEAD that would replay the whole
  pending P6-P9 tree. Their scopes exclude checkout quote work above.
- Current main checkout changes and locale updates must be preserved when
  merging their navigation and translation changes.
- October 6: both workers are terminal (credit exhaustion and revoked network
  permission). Neither temporary worktree nor its patch is available in the
  current environment. Their client tasks remain incomplete and must be
  implemented on this checkout; do not wait for reports or count them as done.

## October 6 Continuation

- Buyer refund confirmation/contestation is now offered only after seller
  evidence exists, matching the service guards. Lifecycle regression observed
  failing, then passing; lifecycle plus refund execution: 19 tests passing.
- Zone quotes now include courier identity, actual provider COD eligibility,
  pickup distance and pickup fee snapshots. Both missing-data regressions
  were observed failing, then passing. Zone quote suite: 9 tests passing.
- Added the public listing delivery-options route and a shared response
  contract. Estimates use the fulfilling supplier for resale listings, default
  to the authenticated viewer's home city or shop city, and aggregate the
  cheapest fee and corresponding ETA per method. They remain hidden while
  zone delivery or ordering is disabled.
- Added the optional Redis estimate cache with a 300-second TTL. Versioned keys
  include zone, location and courier ids/revisions, shop and feature settings,
  destination, listing subtotal and product COD eligibility. Price-dependent
  free delivery cannot leak across listings. Cache outages or malformed cached
  responses cause fresh computation, not checkout failure. Service tests cover
  revision changes, TTL, cheapest pickup, feature gating, supplier fulfillment,
  viewer defaults, inaccessible listings and invalid cache content; route tests
  cover anonymous access, input validation and shared error responses.
- Root `bun run check-types`: 5 successful tasks after the public endpoint.
  API advisory test types: 100 errors. Exact raw cast counts: API 86, clients 78.
  Mobile advisory has not been rerun in this continuation; earlier 35 is not
  presented as a fresh measurement.
- Full API attempt: 279 files, 4027 tests, 4024 passing and three timeouts in
  public-categories, verification-reviewer and verification-seller route specs.
  This is not a green full-suite gate. Those files plus shipment-route-actions
  pass a serial focused rerun: 4 files, 62 tests. A quiet full rerun is still
  required; do not dismiss the failures as pre-existing or raise timeouts to
  conceal them. The full attempt also predates the final public endpoint tests.
- No final completion claim or commit: P6 client work, P7 client screens and
  estimate presentation, P8 checkout seams, P9 integration audit and full
  release verification still remain.
- A new quiet full API run is in progress at the continuation boundary:
  execution session `60447`, output `/tmp/bns-api-full-quiet.txt`. Revalidate
  the handle or log before relying on it; do not restart a live run merely
  because observing its output timed out.

## Rulings

- Shared client form validation imports a pure case-rule contract, not the
  server arithmetic module: the latter pulls Payload server dependencies into
  the web type graph. The server re-exports the same rule; it is not duplicated.
- Zone option IDs follow the specification (`zone:{id}`), while flat mode
  retains `seller_delivery:{city}`. Pickup retains `pickup:{id}`.
- Direct refund actions are controlled by the stored refund channel, not the
  original order payment method: protected providers can fall back to a
  seller-direct refund and need the same evidence flow.

No completion claim or final commit is recorded for the remaining work.
