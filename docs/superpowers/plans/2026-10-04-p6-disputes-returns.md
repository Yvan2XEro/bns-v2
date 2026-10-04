# P6 Disputes and Returns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give buyers an enforceable path when an order goes wrong — the withdrawal right, full refunds for non-conformity and unavailability, a dispute process with the seller's burden of proof applied as explicit presumption rules, moderator arbitration with a bilingual decision certificate — and give sellers their evidence heard, a fair deadline at every step, and consequences (strikes, risk signals) only where the spec assigns them. BuyNSellem never holds or pays out buyer money: COD refunds run seller-direct under supervision with proof; protected refunds run through P5's `MarketplaceProvider` port and its fake. Returns ship unconditionally (the withdrawal right is a legal obligation); disputes ship behind `disputes.enabled`, refused until the G2+G3 gate rows exist.

**Architecture: on P5's hexagonal spine, nothing concrete added.** No payment adapter exists and none is built here; every protected-money effect reaches the provider through `getMarketplaceProvider(settings)` and is tested against `FakeMarketplaceProvider`. The same discipline extends to the two phases P6 reads but that have not shipped: P7 delivery fields make `late_delivery` and `seller_no_show` windows fail closed until they exist, and P8 resale is consumed through a new `adjustResellerCommission` port with a deterministic fake (Task 5), never a P8 import. One P5 debt is paid here, first (Task 13): the reverse-netting posting the P5 checkpoint parked to P6 ("a refund that fails after being netted leaves `seller_receivable` at −r — 15/P6 to decide the un-netting").

**Tech Stack:** Payload CMS 3.79 + MongoDB transactions (`packages/api`, vitest via `bun run test:int`), Next.js 16 + next-intl `{x}` (`packages/web`), Expo SDK 57 + i18next `{{x}}` (`packages/mobile`), both clients `bun test`, Novu, P2 private storage for evidence and certificates.

**Spec:** `docs/superpowers/specs/2026-09-15-p6-disputes-returns-design.md` — the binding authority for every domain rule. Its gates G1–G4 and the L1–L10/N15 question tail belong to production enablement (Task 31's record), **nothing in this plan waits on them**: G1 defaults stay at the buyer-favourable reading, G2/G3 keep `disputes.enabled: false`, G4 keeps `strikeEffectsEnabled: false` and `sellerLossFee: 0`, G5 is P5's own flag (protected orders cannot exist without it), G6 is P8's.

## Global Constraints

Copied from the spec and AGENTS.md; every task's requirements implicitly include this section.

- **Hexagonal, strictly.** No service, route, job or test imports a concrete payment adapter; protected-order refunds go through P5's `requestRefund` → `submitRefund` → the `MarketplaceProvider` port, exercised with `FakeMarketplaceProvider`. P6's protected-money effects presuppose P5's flag (spec G5): a protected order cannot exist while P5 is off, so no extra gate is coded — tests enable the flag with the fake. P8 resale is reached only through Task 5's `adjustResellerCommission` port and its fake; P7 fields are read optionally and their absence fails the dependent windows closed. BuyNSellem never holds or pays out buyer money: no P6 code path moves buyer funds except P5's provider refund or the seller's own documented transfer.
- **Disputes behind the flag, returns never.** `AppSettings.disputes.enabled` defaults `false`; `beforeChange` refuses enabling it without G2 and G3 evidence rows; `strikeEffectsEnabled` and `sellerLossFee > 0` require a G4 row. With disputes off: creation answers `dispute.disabled`, clients route "Report a problem" to `/contact?order={number}` — but open disputes keep running (deadlines, resolution, refunds), so turning the flag off never strands a case. Returns, including P4's withdrawal request, have no enable switch.
- **International rule.** Cameroon is the launch market, not the product. No new hard-coded country constant: VAT comes from the invoice row / `orders.vatRateBps`, currency from the order, business days reuse the exported Douala helpers in `lib/orderMath.ts` (`weekBoundsDouala`'s offset constant — flagged, like P5's "10:00 Africa/Douala", as data to lift with multi-market work). The certificate's recourse sentence names "a consumer association or court", never a Cameroonian statute body by hard-coded string outside the bilingual legal copy the spec dictates.
- **Money is integers in XAF.** Every breakdown computed by `lib/caseMath.ts` with `roundXaf` re-exported from `lib/paymentMath.ts`; `goods + outboundDelivery + returnShipping + buyerProtectionFee − deduction = refund.amount` always (property-tested); a split allocation goes to goods first, then delivery, **never the protection fee**.
- **The ledger has one writer.** `services/ledger.ts` stays the only module that posts; P6 adds exactly one posting kind there (`netting_reversed`, Task 13) and otherwise causes postings only through P5's landed services. Order status and paymentStatus writes go only through `applyTransition` (`services/orders/transitions.ts`); P6 extends `UNRESERVED_TRANSITIONS` for its own rows exactly as P5 unreserved `paid`'s. `services/stock.ts` stays the only stock writer; `transitions.ts` the only creator of `order-events`.
- **Transactions and after-commit.** Multi-document writes in one Payload transaction (`lib/transactions.ts`), the moderation log entry inside it (`resolveDispute` is explicitly transactional, unlike the older sequential moderation writes — the spec says why: it creates financial records). Provider calls and Novu triggers happen after commit (`onCommit` / queued jobs). Risk signals are written **inside** the causing transaction (spec).
- **Idempotency everywhere money or state moves.** Dispute refunds use key `dispute:{id}:refund`; case refunds `return-case:{id}:1` (P5's `{sourceType}:{sourceId}:{seq}`); P5's `requestRefund` already returns the live row for a repeated source, which is the mechanism Review Focus 1 pins. Every job action is idempotent against the state machines: run twice, nothing changes — each job test runs twice and asserts counts.
- **Error codes once, translated twice.** The 19 new codes (contracts section) declared in `packages/api/src/lib/errors.ts`, FR/EN in `packages/web/messages/*` (`ApiErrors`) and `packages/mobile/src/locales/*` (`apiErrors`), parity specs extended (the P5 Task 1 pattern). Reused, never redeclared: `upload.tooLarge`, `upload.invalidType`, `generic.rateLimited`, `moderation.forbidden`, `moderation.rankTooLow`, `moderation.invalidTransition`, `moderation.reasonRequired`, `refund.windowExpired`.
- **Locale keys in their own namespaces** — web `Returns`/`Disputes`, mobile `returns`/`disputes` — FR and EN in the same change, byte-parity across clients where the vocab parity family reaches (Task 7 extends it the way `payment-vocab-parity.int.spec.ts` pinned its 159 keys). Mobile interpolation `{{x}}`, web `{x}`. Legal copy (certificate, return instructions, credit notes, the review-step sentence) bilingual verbatim from the spec.
- **The P5 spec-amendment inheritance is resolved, not inherited.** P4 spec l.523 (seller-cancel from `accepted` only) vs l.564 (`paid → cancelled` by seller decline) — P6's `unavailable` case hooks the `order.cancelled` event and is downstream of whichever cancel path ran (see Conflicts, item 4).
- **Tests assert values.** Whole-object `toEqual` for wire shapes; counting over absence-of-complaint; secrecy assertions paired with positive ones; every task carries mutation evidence (break the code one named way, watch the named test go red, restore).
- **Ceilings (AGENTS.md), measured with the published commands on a quiet tree:** `check-types:tests` ≤ 105; `as never` in `packages/api/tests` ≤ 86; client casts ≤ 78; mobile advisory ≤ 35 with a fresh `.expo/types/router.d.ts`. None may rise, and none is ever republished upward.
- **Runners:** `packages/api` is vitest — `bun run test:int` or `bunx vitest run --config ./vitest.config.mts <file>`, never `bun test` there; web and mobile are `bun test`; `bun run generate:types` after any collection change, committed with it.
- **Commits one line, no attribution trailers** (the `.husky/commit-msg` hook strips and fails them; never `--no-verify`). Docs in English; comments sparse — only non-obvious reasons.

## Review Focus

The five failure modes the spec implies that no single task's tests would otherwise exercise, most likely first. Each line's pinning test is assigned to the owning task.

1. **A retried resolution must never pay twice.** `applyOutcome` run twice (job retry, double submit, webhook replay) issues one P5 refund under `dispute:{id}:refund`, one credit note, one strike set, one certificate render — the second run returns the recorded effects and writes nothing. → Task 16's rerun pin.
2. **A silence default racing a live response.** A seller's `respond` landing in the same minute `advanceDisputes` applies the `respondBy` default must yield exactly one terminal path: the job re-reads the dispute status **inside its per-dispute transaction**, not only in its selection query — a dispute that moved since selection is skipped. → Task 17's race pin.
3. **Two holds, one order.** Resolving a dispute while a return case is still active must hand `completionHold` to `return_case`, not `none` — and vice versa: a case closing under an active dispute keeps `dispute`. `completeOrders` must stay blocked while either exists. → Task 16's two-holds matrix.
4. **The `refund.windowExpired` channel switch must have one payer.** A case switched to `seller_direct` re-running `executeRefund` stays `seller_direct` with zero `refunds` rows for the case; a dispute-keyed refund that threw `windowExpired` never leaves a `created` row behind for `submitRefund` to find later. → Task 11's switch pin.
5. **Evidence visibility is a wall, not a default.** A party must never obtain metadata, a signed URL, or a message body for `staff`-visibility rows; a redacted body appears in no API response and survives only in the moderation log metadata. Asserted positively (the moderator sees it) and negatively (the party's whole response JSON, stringified, does not contain the marker string). → Task 14's visibility matrix; Task 18's redaction pin.

## Current state (re-verified 2026-10-04 — the spec's own list predates P1–P5)

- P0–P5 are green: API 169+ files / ~3400 tests, web ~533, mobile ~624. Ceilings hold at 105/86/78/35.
- **`return-cases` already exists** (`collections/ReturnCases.ts`): P4 created it with `RETURN_CASE_BASES` (4) and `RETURN_CASE_STATUSES` (all 13, named so the stored value is never narrower than P6 writes), number/order/shop/buyer/items(quantity-level)/reasonText/openedBy/status/statusHistory minimal fields, access already P6's rule (buyer + shop members + moderators read, writes closed). `services/orders/withdrawal.ts#openWithdrawal(payload, user, orderId, {items, reasonText})` creates a case in `requested`, moves items to `return_requested` through `applyTransition`, sets `completionHold: "return_case"` + `orders.returnCase`, and its comment says: *"P6 replaces this function's body with `services/returns.ts#openWithdrawal` behind this exact signature."*
- **Orders:** `ORDER_STATUSES` includes `returned` and `disputed`; `STATUS_TRANSITIONS` already carries the rows (`shipped: [... "disputed"]`, `delivered: ["completed","returned","disputed"]`, `disputed: ["shipped","delivered","returned","cancelled"]`) but they are **reserved**: `RESERVED_STATUSES = ["paid","returned","disputed"]`, opened per-row via `UNRESERVED_TRANSITIONS` or `RESERVED_TRANSITION_CONTEXT` (P5's `placed→paid` precedent). `completionHold` select (`none|return_case|dispute`) exists and `jobs/completeOrders.ts` already requires `none`. `order-events` reserved types `order.disputed`, `order.returned` are declared, never written. P4's `contestDelivery` (`services/orders/delivery.ts`) sets `completionHold: "dispute"` and creates a `reports` row "for staff **until P6 turns it into a dispute**" (P4 spec's own words).
- **P5 money machinery, landed:** `services/refunds.ts` — `requestRefund(req, {order, amount?, breakdown?, reason, sourceType, sourceId})` with reasons including `withdrawal`, `dispute`, `unavailable`, sourceTypes including `return-case` and `dispute` ("P6 by contract"), `REFUND_WINDOW_DAYS = 85`, one-live-refund-per-source (a repeated ask returns the live row), `refundBreakdown` (partial never touches the fee), `applyRefundEvent`, `applyDebitEvent`, `recoverSellerReceivables` with `CLAWBACK_SHARE_BPS = 5_000` and `RECEIVABLE_WRITEOFF_DAYS = 60`, `creditNoteFor` (buyer-fee credit notes) already called on full refunds. `services/payouts.ts` — `netReceivables`/`plannedNettings`/`receivablesToBeNetted` (the netting planner; the un-netting on final failure is the parked debt Task 13 pays). `services/ledger.ts` — `postingFor`, `postLedger`, `ledgerIdempotencyKey`, the postings table including the checkpoint-corrected `payout_reversed`. `services/payoutHolds.ts` — `createHold` (idempotent per `{scope, shop, order, reason}` while active), `releaseHold`, `findActiveHold`, `activeHolds`, `holdReasonCategory`, reasons already include `dispute_open` and `return_open` (the P5 spec named them for P6). `requestRefund` refuses a refund on an order with releasable funds **unless** an order hold `return_open|dispute_open` exists — P6 creates them.
- **Moderation:** `services/moderation.ts` — `ModerationError extends ServiceError`, `assertModerator`, rank checks, `writeLog`, `MODERATOR_CANCELLABLE_STATUSES` (includes `paid` since P5's D-6/staff-cancel fix), `holdPayouts`/`releasePayoutHold` rank ladder, `shopPaymentsSheet`. `MODERATION_ACTIONS` has 23 entries; `moderation-log` is append-only, service-written. Moderation routes exist for listings/users/shops/orders/reports/verification + `moderation/summary`.
- **Invoices and sequences:** `nextNumber(payload, prefix, date)` (monthly, gaps allowed, outside the transaction) serves `RET` already; `DSP` is free. `nextInvoiceNumber(req, series, date)` already types series `"C" | "F" | "A"` — **series A was pre-wired for P6's credit notes**. `collections/CommissionLines.ts` already lists kind `credit` ("written by P6", its comment says); `lib/orderMath.ts#netting` handles a negative total as `credit_carry_over`. `lib/textPdf.ts` + `lib/commissionInvoiceDocument.ts` + `services/buyerFeeInvoices.ts#storePdf` are the bilingual PDF idiom; `lib/privateFiles.ts#createSignedDocumentUrl(doc, ttlSeconds, localRoute)` signs private files; `collections/VerificationDocumentViews.ts` is the view-log model to copy; `collections/PaymentGateEvidence.ts` is the gate-evidence model to copy.
- **Reviews:** `collections/Reviews.ts` has `order`, `shop`, `verifiedPurchase`, rating/comment; **no `status` field**; `hooks/reviews.ts#updateUserRating` recomputes ratings; `services/reviewRules.ts#assertOrderReviewAllowed` + `ORDER_REVIEWABLE_STATUSES` gate creation.
- **Notifications:** `scripts/syncNotificationWorkflows.ts` declares ~60 workflows; the mixed-audience rule is established (`audience` in the payload, `hooks/notificationEvents.ts` routes buyer vs shop); `order-withdrawal-requested` exists (P4) and the P6 spec retires its shop half in favour of `return-requested`.
- **Jobs:** `payload.config.ts` has queues `nightly`, `payments` (P5), `default`; P6 adds `cases`. TaskConfig-export-only-then-sole-owner-registers is the landed pattern.
- **Clients:** buyer order pages are **`/purchases/[id]`** on both clients (the spec writes `/orders/[id]`; see Conflicts 1). Web has `withdrawal-dialog.tsx` on the purchase page and `app/moderation/layout.tsx` (verification only); mobile has `app/purchases/[id]/withdrawal.tsx`, `app/moderation/*` screens with `ModerationScreen`/`DecisionSheet`, `src/lib/deepLinks.ts` (`PAYMENT_DEEP_LINKS`, `notificationUrl`), `routeRegistration.test.ts`. Order action tables live in `packages/web/src/lib/order-actions.ts` / `packages/mobile/src/lib/*` and are compared by `order-actions-parity.int.spec.ts`; `request_withdrawal` is already a buyer action row.
- **Settings:** `AppSettings.orders.withdrawalDays` (15) exists and is the single source for the withdrawal period; no `returns` or `disputes` group; `GET /api/public/config` exists (P5 extended it).
- `lib/errors.ts` has 0 `return.*`/`dispute.*` codes. `packages/api` has sharp (Payload's image dependency) for the EXIF strip.

## File structure

New, `packages/api/src/`:
- `lib/caseSettings.ts` (+ test) — `getReturnSettings`, `getDisputeSettings`, fail-closed.
- `lib/caseMath.ts` (+ test) — refund breakdowns, split allocation, deduction rules, commission-credit arithmetic, business days.
- `lib/disputeRules.ts` (+ test) — windows, opener eligibility, evidence requirements, silence defaults, proof checklist (pure part).
- `lib/resale.ts` (+ test) — the P8 adjustment port, registry and fake; `collusionMatch`.
- `lib/exifDate.ts` (+ test) — bounded EXIF `DateTimeOriginal` scanner (no new dependency).
- `lib/disputeCertificateDocument.ts` — the bilingual certificate document for `lib/textPdf.ts`.
- `collections/`: `Disputes.ts`, `DisputeMessages.ts`, `DisputeEvidence.ts`, `DisputeEvidenceViews.ts`, `ShopStrikes.ts`, `RiskSignalOutbox.ts`, `DisputeGateEvidence.ts`.
- `services/`: `returns.ts`, `returnRefunds.ts` (executeRefund + COD proof — own file for wave parallelism, Conflicts 7), `disputes.ts`, `disputeOutcome.ts` (applyOutcome — own file, same reason), `disputeEvidence.ts`, `disputeCertificates.ts`, `strikes.ts`, `riskSignals.ts`, `reviewRelease.ts`, `caseNotifications.ts` (typed no-op skeleton in Task 6, implemented in Task 20).
- `jobs/`: `advanceDisputes.ts`, `advanceReturnCases.ts`, `renderDisputeCertificate.ts`, `publishHeldReviews.ts`, `expireStrikes.ts`, `purgeCaseEvidence.ts` (each a TaskConfig export only; **Task 21 is sole owner of `jobs/index.ts` + `payload.config.ts`** in its wave).
- Routes under `app/(frontend)/api/`: `orders/[id]/returns`, `orders/[id]/disputes`, `returns/[id]` (+ `/ship`, `/pickup`, `/receive`, `/inspect`, `/deduction`, `/refund-proof`, `/confirm-refund`, `/contest-refund`, `/cancel`, `/evidence`, `/evidence/[evidenceId]/url`), `disputes/[id]` (+ `/submit`, `/messages`, `/respond`, `/proposal`, `/escalate`, `/withdraw`, `/evidence`, `/evidence/[evidenceId]/url`), `me/returns`, `me/disputes`, `shops/[id]/returns`, `shops/[id]/disputes`, `moderation/disputes`, `moderation/disputes/[id]`.

Modified: `globals/AppSettings.ts` (`returns` + `disputes` groups), `collections/ReturnCases.ts`, `Orders.ts` (`activeDispute`), `Reviews.ts` (`status`), `CommissionInvoices.ts` (`kind`, `creditsInvoice`, `sourceType`/`sourceId`), `ModerationLog.ts` (+4 actions, target `dispute`), `Categories.ts` (`withdrawalExcluded`), `lib/errors.ts`, `services/ledger.ts` (one kind, Task 13), `services/refunds.ts` + `services/payouts.ts` (Task 13), `services/moderation.ts` (Task 18), `services/commission.ts` (Task 12), `services/orders/withdrawal.ts` (body swap, Task 9), `services/orders/delivery.ts` (contest conversion, Task 15), `services/orders/transitions.ts` (unreserve rows: Task 15 the two into `disputed`, Task 16 the four out + `delivered→returned`), `services/reviewRules.ts`, `lib/shopCapabilities.ts`/`services/checkoutPayment.ts`/`lib/orderSettings.ts` (standing effects, Task 8), `plugins/storage.ts` (dispute-evidence on the private adapter), `scripts/syncNotificationWorkflows.ts`, `hooks/notificationEvents.ts`, both clients' locales, hooks, screens and parity specs.

## API contracts

The wire shapes clients build against. The serialisers must produce these exactly; pin each whole object with `toEqual` (P4's drift lesson). All amounts integer XAF. Vocabulary strings are the collections' own option values, verbatim from the spec's Data model.

```ts
// GET /api/returns/{id}  (buyer, active shop members, moderators)
interface ReturnCaseView {
  id: string; number: string;                    // "RET-2610-000012" — nextNumber("RET", …)
  orderId: string; orderNumber: string;
  basis: "withdrawal" | "non_conformity" | "late_delivery" | "unavailable";
  status: "requested" | "approved" | "rejected" | "cancelled" | "awaiting_shipment"
        | "in_transit" | "received" | "inspected" | "disputed" | "refund_pending"
        | "refunded" | "closed" | "expired";
  returnRequired: boolean;
  returnMethod: "buyer_drop_off" | "courier" | "seller_pickup" | null;
  returnTracking: string | null;
  items: Array<{
    orderItemId: string; title: string; quantity: number; unitPrice: number;
    buyerCondition: "unopened" | "opened" | "used" | "damaged" | null;
    inspection: null | {
      outcome: "restock" | "damaged_by_buyer" | "damaged_in_transit" | "not_matching" | "missing";
      deductionAmount: number; note: string | null;
    };
  }>;
  reasonText: string | null;
  deadlines: { requestDeadline: string | null; shipBy: string | null; pickupBy: string | null;
               inspectBy: string | null; refundBy: string | null };
  refund: {
    amount: number;
    breakdown: { goods: number; outboundDelivery: number; returnShipping: number;
                 buyerProtectionFee: number; deduction: number };
    channel: "provider" | "seller_direct" | null;
    providerRefundStatus: string | null;            // P5 refund status, protected only
    sellerProof: null | { method: "cash" | "mtn_momo" | "orange_money";
                          transactionId: string | null; amount: number; submittedAt: string };
    buyerConfirmedAt: string | null; contestedAt: string | null;
  };
  disputeId: string | null;
  rejectionReason: string | null;                   // shown on automatic rejection
  timeline: Array<{ status: string; actorType: "buyer" | "seller" | "system" | "moderator";
                    at: string; note: string | null }>;
  allowedActions: ReturnAction[];                   // role-aware, server-decided
}
type ReturnAction = "ship" | "pickup" | "receive" | "inspect" | "accept_deduction"
  | "contest_deduction" | "refund_proof" | "confirm_refund" | "contest_refund"
  | "cancel" | "upload_evidence";

// GET /api/me/returns, GET /api/shops/{id}/returns?status=&overdue=true
interface ReturnListRow { id: string; number: string; orderNumber: string; basis: string;
  status: string; refundAmount: number; nextDeadline: string | null; overdue: boolean;
  createdAt: string }
// both answer { rows: ReturnListRow[]; awaitingCount: number }  // awaiting the CALLER's action

// GET /api/disputes/{id}  (buyer, members of shop and resale.supplierShop, moderators)
interface DisputeView {
  id: string; number: string;                      // "DSP-2610-000007" — nextNumber("DSP", …)
  orderId: string; orderNumber: string; shopId: string; shopName: string;
  subject: "goods" | "refund";
  reason: "not_received" | "not_as_described" | "damaged" | "counterfeit" | "wrong_item"
        | "seller_no_show" | "cod_refused_abuse";
  status: "open" | "awaiting_seller" | "awaiting_buyer" | "under_review"
        | "resolved_buyer" | "resolved_seller" | "resolved_split" | "withdrawn";
  paymentMethod: "cod" | "mobile_money";
  amountAtStake: number;
  items: Array<{ orderItemId: string; title: string; quantity: number }>;
  requestedOutcome: "full_refund" | "partial_refund" | "return_and_refund" | "no_refund";
  requestedAmount: number | null;
  openedByType: "buyer" | "seller" | "system";
  deadlines: { submitBy: string | null; respondBy: string | null; reviewDueAt: string | null };
  proposal: null | { amount: number; returnRequired: boolean; byType: string; round: number;
                     status: "open" | "accepted" | "rejected" | "lapsed"; expiresAt: string };
  resolution: null | {
    outcome: "resolved_buyer" | "resolved_seller" | "resolved_split";
    refundAmount: number;
    breakdown: ReturnCaseView["refund"]["breakdown"];
    returnRequired: boolean; returnShippingPaidBy: "seller" | "buyer" | null;
    liableParty: "seller" | "supplier" | "reseller" | "courier" | "buyer" | "none";
    reasonCode: "seller_no_proof" | "delivery_proven" | "item_conforms" | "item_not_conforming"
      | "counterfeit_confirmed" | "counterfeit_not_established" | "damage_in_transit"
      | "buyer_damage" | "buyer_abuse" | "review_extortion" | "partial_fault" | "agreement" | "other";
    publicStatement: { fr: string; en: string };
    decidedByType: "system" | "agreement" | "moderator"; decidedAt: string;
    certificateAvailable: boolean;                  // true once renderDisputeCertificate stored it
  };
  returnCaseId: string | null;
  viewerRole: "buyer" | "seller" | "supplier" | "moderator";
  messages: Array<{ id: string; authorType: "buyer" | "seller" | "supplier" | "moderator" | "system";
    kind: "message" | "proposal" | "proposal_response" | "info_request" | "decision" | "system";
    body: string | null;                            // null when redacted; redacted: true
    redacted: boolean; evidenceIds: string[]; at: string }>;
    // `staff`-visibility messages are ABSENT for parties, present for moderators
  evidence: Array<{ id: string; kind: "photo" | "video" | "document" | "payment_proof" | "shipping_proof";
    mimeType: string; size: number; uploadedByType: string; capturedAt: string | null;
    sha256Reused: boolean;                          // moderators only; false for parties
    visibility: "parties" | "staff" }>;             // `staff` rows absent for parties
  systemEvidence: {                                 // assembled at read time, never stored
    timeline: Array<{ type: string; at: string }>;  // order-events, both roles
    handover: null | { method: string; verifiedAt: string | null };  // caller's own record
    payment: null | { paymentStatus: string; refundedAmount: number };
    snapshot: unknown | null;                       // order contract snapshot — moderators only
  };
  allowedActions: DisputeAction[];
}
type DisputeAction = "submit" | "message" | "respond_accept" | "respond_propose"
  | "respond_contest" | "proposal_accept" | "proposal_reject" | "escalate" | "withdraw"
  | "upload_evidence";

// GET /api/me/disputes, GET /api/shops/{id}/disputes?status=
interface DisputeListRow { id: string; number: string; orderNumber: string; reason: string;
  subject: string; status: string; amountAtStake: number; respondBy: string | null;
  awaitingMe: boolean; createdAt: string }
// shop list answers { rows, awaitingCount, standing: ShopStandingView }

// Standing (shop members and moderators; also embedded in the moderation sheet)
interface ShopStandingView {
  activeWeight: number;
  effectsEnabled: boolean;                          // disputes.strikeEffectsEnabled (G4)
  restrictions: { codCapHalved: boolean; protectedCapHalved: boolean;
                  protectedUnavailable: boolean };  // all false while !effectsEnabled
  strikes: Array<{ id: string; kind: "dispute_lost" | "refund_overdue" | "counterfeit_confirmed"
    | "no_response" | "unavailable_after_confirmation" | "review_extortion";
    weight: 1 | 2 | 3; status: "active" | "expired" | "revoked"; expiresAt: string;
    sourceType: "dispute" | "return-case"; createdAt: string }>;
}

// GET /api/moderation/disputes?status=&reason=&paymentMethod=&overdue=true&assigned=me
//   sorted by nearest deadline; moderator+
interface ModerationDisputeRow { id: string; number: string; reason: string; subject: string;
  paymentMethod: string; amountAtStake: number; status: string; deadline: string | null;
  overdue: boolean; assignedTo: string | null; ageDays: number }

// GET /api/moderation/disputes/{id} — the arbitration sheet
interface ModerationDisputeSheet {
  dispute: DisputeView;                             // viewerRole "moderator": everything visible
  proofChecklist: Array<{ requirement: string; established: boolean; source: string | null }>;
  refundable: number;                               // the resolve ceiling
  components: { goods: number; outboundDelivery: number; buyerProtectionFee: number };
  partyHistory: { buyerRefusalScore: number; buyerDisputes12m: number;
                  shopStanding: ShopStandingView; shopDisputeLossRate: number | null };
  resale: null | { supplierShopId: string; resellerShopId: string; purchaseOrder: string | null };
  moderatorRefundLimit: number;                     // 250,000 — above it the form warns "admin only"
}

// POST /api/moderation/disputes/{id}
//   { action: "assign" }                                      → assignedTo = actor
//   { action: "request_info", from: "buyer"|"seller", message } → 72 h deadline
//   { action: "preview", refundAmount, returnRequired, returnShippingPaidBy }
//       → { breakdown, channel, creditNoteHt, feeRefunded } — computed server-side, written nowhere
//   { action: "resolve", outcome, refundAmount, returnRequired, returnShippingPaidBy,
//     liableParty, reasonCode, publicStatement: { fr, en }, note, reviewAction? }
//   { action: "redact_message", messageId, note }
//   { action: "revoke_strike", strikeId, note }               → admin only

// POST /api/orders/{id}/returns   (buyer)
//   { basis: "withdrawal" | "late_delivery", items: [{ orderItemId, quantity }],
//     reasonText?, returnMethod } → 201 ReturnCaseView, or:
//   return.notEligible | return.windowClosed | return.itemsInvalid | return.alreadyOpen
// POST /api/orders/{id}/disputes  (buyer; shop owner/manager for seller reasons)
//   { reason, items, description, requestedOutcome, requestedAmount?, returnCaseId?, subject? }
//   → 201 DisputeView, or: dispute.disabled | dispute.notParty | dispute.reasonNotAllowed
//   | dispute.windowClosed | dispute.alreadyOpen | dispute.returnCaseActive
// POST /api/disputes/{id}/respond { action: "accept"|"propose"|"contest", amount?,
//   returnRequired?, message?, evidenceIds? }
// POST /api/disputes/{id}/proposal { action: "accept" | "reject" }
// POST /api/returns/{id}/inspect { items: [{ orderItemId, outcome, deductionAmount?, note? }] }
// POST /api/returns/{id}/deduction { action: "accept" | "contest" }
// POST /api/returns/{id}/refund-proof { method, transactionId?, amount, evidenceIds }
//   transactionId required for mtn_momo|orange_money → return.refundProofInvalid
// POST /api/disputes/{id}/evidence, /api/returns/{id}/evidence — multipart, limits below
// GET  /api/{disputes|returns}/{id}/evidence/{evidenceId}/url → { url, expiresAt } (5 min)
// GET  /api/public/config gains { disputesEnabled: boolean }
```

New error codes (19 — Task 1 declares all, both clients translate all):
`return.notEligible`, `return.windowClosed`, `return.itemsInvalid`, `return.alreadyOpen`, `return.invalidTransition`, `return.deductionEvidenceRequired`, `return.deductionNotAllowed`, `return.refundProofInvalid`, `dispute.disabled`, `dispute.notParty`, `dispute.reasonNotAllowed`, `dispute.windowClosed`, `dispute.alreadyOpen`, `dispute.returnCaseActive`, `dispute.evidenceRequired`, `dispute.evidenceLimit`, `dispute.invalidTransition`, `dispute.proposalInvalid`, `dispute.refundExceedsOrder`.

**The worked order every money fixture derives from** (computed by `splitAmounts`/`commissionForLine`, so fixtures cannot drift): goods (subtotal) 40,000 + delivery 2,000 = orderTotal 42,000; commission 3,200 HT + 616 VAT (19.25%); protected: buyerProtectionFee 1,260, destinationAmount 38,184, buyerTotal 43,260; COD: buyer paid 42,000, no fee. One item of goods value 15,000 partially returned on withdrawal → refund exactly 15,000 (no outbound delivery: not every item; no fee: never on partial). Full `non_conformity`, return shipping documented at 6,500 → breakdown { goods 40,000, outboundDelivery 2,000, returnShipping 5,000 (capped), buyerProtectionFee 1,260 protected / 0 COD, deduction 0 }. Commission credit for the 15,000 partial: `creditHt = roundXaf(3200 × 15000 / 40000) = 1,200`, VAT 231, credit TTC 1,431.

## Task dependency structure

- Wave 1: Task 1 (error contract).
- Wave 2 (parallel): Tasks 2, 3, 4, 5, 13 (13 — the P5 reverse-netting debt — touches only P5 files, no P6 dependency).
- Wave 3: Task 6 (collections), Task 7 (client vocabulary).
- Wave 4 (parallel): Tasks 8, 9, 14, 15.
- Wave 5 (parallel): Tasks 10, 12.
- Wave 6 (parallel): Tasks 11, 16.
- Wave 7 (parallel): Tasks 17, 18, 19.
- Wave 8: Tasks 20, 21 (21 last in the wave — sole owner of `jobs/index.ts` + `payload.config.ts`).
- Wave 9: Task 22 (backend checkpoint).
- Wave 10 (parallel, web): Tasks 23, 24, 25, 26.
- Wave 11 (parallel, mobile): Tasks 27, 28, 29.
- Wave 12: Task 30 (mobile registrations — sole owner of `app/_layout.tsx`).
- Wave 13: Task 31 (staging/release — the buildable half).

Worktree-per-agent (AGENTS.md's P3 lesson); tasks sharing a file are in different waves or one owns the file, as noted per task.

## Wave 1 — the error contract

### Task 1: The 19 error codes in all three packages

**Files:**
- Modify: `packages/api/src/lib/errors.ts`, `packages/web/src/lib/apiError.ts`, `packages/mobile/src/lib/apiError.ts`, `packages/web/messages/{fr,en}.json` (`ApiErrors`), `packages/mobile/src/locales/{fr,en}.json` (`apiErrors`).
- Test: extend `packages/api/tests/int/error-codes.int.spec.ts` and `error-codes-parity.int.spec.ts`.

**Interfaces:**
- Produces: the 19 codes of the contracts section — `ERROR_CODES` keys `returnNotEligible: "return.notEligible"` … `disputeRefundExceedsOrder: "dispute.refundExceedsOrder"` — each with an English fallback sentence in all three files and FR/EN translations in both clients. Fallbacks user-facing and actionable, the P4 register (e.g. `return.windowClosed`: "The return window for this order has closed."; `dispute.evidenceRequired`: "This reason needs at least one photo or video before you can submit."; `dispute.disabled`: "Disputes are not open yet. Contact us and we will follow up on your order.").
- Consumes: the existing parity spec, which compares the three files — the new codes must enter all three or it goes red, which is the point. Nothing redeclares the reused codes listed in Global Constraints.

- [ ] **Step 1: run the parity spec red** by adding the 19 codes to `lib/errors.ts` alone. Expected: it names every missing client entry.
- [ ] **Step 2: add fallbacks to both clients and translations to all four locale files.** Mobile `{{x}}`, web `{x}`; French accented.
- [ ] **Step 3: green** — `bunx vitest run --config ./vitest.config.mts tests/int/error-codes*` in `packages/api`, `bun test` in both clients.
- [ ] **Step 4: mutation** — remove one mobile translation → the parity gate names it. Restore.
- [ ] **Step 5: commit** — `feat(cases): declare P6's error contract once and prove the three copies agree`

## Wave 2 — settings, pure rules, the seams, the P5 debt

### Task 2: `AppSettings.returns` + `disputes`, the gate record, the public flag

**Files:**
- Modify: `packages/api/src/globals/AppSettings.ts`, `app/(frontend)/api/public/config/route.ts`, `payload.config.ts` (register the one collection below — no other task touches it this wave).
- Create: `packages/api/src/lib/caseSettings.ts`, `packages/api/src/collections/DisputeGateEvidence.ts` (clone of `PaymentGateEvidence.ts`: slug `dispute-gate-evidence`, adminOnly, pdf/jpeg/png/webp ≤ 20 MB, P2 private storage prefix).
- Test: `packages/api/tests/int/case-settings.int.spec.ts` (**new**).

**Interfaces:**
- Produces: `getReturnSettings(payload): Promise<ReturnSettings>` and `getDisputeSettings(payload): Promise<DisputeSettings>` — fail-closed like `getOrderSettings` (unreadable global → disputes disabled, returns at the spec defaults, which are legal minimums, not features).
- Produces: the `returns` group with exactly the spec defaults — `shipByDays: 15`, `nonConformityShipByDays: 7`, `sellerPickupDays: 5`, `inspectDays: 3`, `receivePresumptionDays: 7`, `refundDays: 15`, `codRefundConfirmSilenceDays: 7`, `lateDeliveryGraceDays: 7`, `returnWaiverMaxGoodsValue: 10000`, `refundOutboundDeliveryOnWithdrawal: true`, `maxReturnShippingReimbursement: 5000`. **No enable switch.** The withdrawal period stays `orders.withdrawalDays` (single source); a `beforeChange` validation refuses setting it or `returns.refundDays` below 15 until a G1 gate row exists.
- Produces: the `disputes` group — `enabled: false`, `submitAutoHours: 24`, `respondHours: 72`, `reminderHours: 48`, `proposalHours: 72`, `maxProposalRounds: 3`, `reviewBusinessDays: 5`, `maxInfoRequests: 2`, `moderatorRefundLimit: 250000`, `notReceivedMaxDays: 60`, `conformityWindowDays: 15`, `counterfeitWindowDays: 60`, `noShowWindowDays: 7`, `evidenceRetentionDays: 1095`, `evidenceLimit: { perParty: 10, total: 30 }`, `strikeEffectsEnabled: false`, `sellerLossFee: 0`, `gates: []` (array `{ gate: "G1".."G4", clearedAt, clearedBy, evidence (relationship dispute-gate-evidence), note }` — P5's exact pattern). `beforeChange` refuses `enabled: true` without G2 **and** G3 rows (reason strings name the missing gate ids); refuses `strikeEffectsEnabled: true` or `sellerLossFee > 0` without G4.
- Produces: `GET /api/public/config` gains `disputesEnabled` (the one place both clients learn the flag, so "Report a problem" routing is server-decided).
- Consumes: P5's gates idiom; `getOrderSettings` for the withdrawalDays cross-validation.

- [ ] **Step 1: failing tests** (fakePayload `globals` seeding, the `order-settings` idiom): fails closed when the global is unreadable (disputes disabled, returns at defaults, every default asserted **by value**); `beforeChange refuses disputes.enabled without a G2 or without a G3 row` (two cases, each missing exactly one); `refuses strikeEffectsEnabled and sellerLossFee > 0 without G4`; `refuses orders.withdrawalDays: 14 and returns.refundDays: 10 without a G1 row, accepts both with one`; `public config answers disputesEnabled false then true` (gate rows flipped last).
- [ ] **Step 2–3: implement, `bun run generate:types`, green.**
- [ ] **Step 4: mutation** — drop the G3 half of the enable check → its case red. Restore.
- [ ] **Step 5: commit** — `feat(cases): the returns and disputes settings groups, their gate record and the public flag`

### Task 3: `lib/caseMath.ts` — breakdowns, splits, credits, business days

**Files:**
- Create: `packages/api/src/lib/caseMath.ts`
- Test: `packages/api/tests/int/case-math.int.spec.ts` (**new**)

**Interfaces:**
- Produces, all pure:
  - `caseBreakdown({ basis, goods, fullOrder, orderDeliveryFee, documentedReturnShipping, returnShippingPaidBy, buyerProtectionFee, deduction, settings }): CaseBreakdown` implementing the spec's Breakdown section: `goods = g − deduction`; `outboundDelivery` = the order delivery fee when **every** item is refunded and basis ∈ {`non_conformity`, `late_delivery`, `unavailable`} or (`withdrawal` and `refundOutboundDeliveryOnWithdrawal`), else 0; `returnShipping` = documented buyer cost clamped to `maxReturnShippingReimbursement` when `returnShippingPaidBy === "seller"`, else 0; `buyerProtectionFee` = the order's fee on a **full** refund of a protected order, 0 otherwise (P5 rule, pending P5-L3); `amount` = the sum.
  - `splitAllocation({ refundAmount, goods, orderDeliveryFee }): { goods, outboundDelivery, buyerProtectionFee: 0 }` — goods first, then delivery, **never the fee**; throws on `refundAmount > goods + orderDeliveryFee`.
  - `deductionAllowed({ basis, itemPrice, amount }): { ok: true } | { ok: false; code: "return.deductionNotAllowed" | "return.itemsInvalid" }` — refused entirely for `non_conformity`, refused above the item price.
  - `commissionCredit({ commissionHt, refundedGoods, commissionBase, vatRateBps }): { creditHt, creditVat, creditTtc }` — `creditHt = roundXaf(commissionHt × refundedGoods / commissionBase)`, VAT at the **invoice's** rate (never a fresh country constant).
  - `businessDaysAfter(start: Date, days: number): Date` — Monday–Friday in Africa/Douala, reusing `lib/orderMath.ts`'s exported offset discipline (UTC+1 fixed, no DST — same constant, imported or re-derived in one place).
  - `roundXaf` re-exported from `lib/paymentMath.ts`, not duplicated.
- Consumes: nothing at runtime; `splitAmounts`/`commissionForLine` in tests to build undrifting fixtures.

- [ ] **Step 1: failing tests**, each by exact value on the worked order: withdrawal partial 15,000 → `{goods: 15000, outboundDelivery: 0, returnShipping: 0, buyerProtectionFee: 0, deduction: 0, amount: 15000}` (whole-object); withdrawal full with the setting on → outboundDelivery 2,000; same with the setting off → 0; `non_conformity` full with documented shipping 6,500 → returnShipping 5,000 (the cap), fee 1,260 protected and 0 COD (two cases); deduction 4,000 on a 15,000 item → goods 11,000; deduction on `non_conformity` → `return.deductionNotAllowed`; deduction 15,001 → refused; `splitAllocation(10000)` → `{goods: 10000, outboundDelivery: 0}` and `(41500)` → `{goods: 40000, outboundDelivery: 1500}` and `(42001)` throws; **property test, 500 random cases**: breakdown components sum to `amount`, every component an integer ≥ 0, fee > 0 only when full ∧ protected; `commissionCredit` 15,000/40,000 → `{creditHt: 1200, creditVat: 231, creditTtc: 1431}`; `businessDaysAfter(Thu 2026-10-08 15:00 Douala, 5)` → Thu 2026-10-15 15:00 (crosses one weekend), and a Friday-evening start crosses to the second week.
- [ ] **Step 2–4: implement, green, mutations** — allocate the split to delivery first → its case red; apply the shipping cap before the paidBy check → the buyer-pays case red. Restore.
- [ ] **Step 5: commit** — `feat(cases): the case money arithmetic — breakdowns, splits, credits, business days`

### Task 4: `lib/disputeRules.ts` — windows, eligibility, silence, proof

**Files:**
- Create: `packages/api/src/lib/disputeRules.ts`
- Test: `packages/api/tests/int/dispute-rules.int.spec.ts` (**new**)

**Interfaces:**
- Produces, all pure (callers pass loaded records; nothing here reads the DB):
  - `reasonWindow(reason, order, settings, now): { open: boolean; closesAt: string | null; reason?: "windowClosed" | "notYetOpen" | "unavailableBeforeP7" | "notDelivered" }` — the spec's Reasons table verbatim: `not_received` from `shippedAt + 7 days` (the pre-P7 fallback; `delivery.promisedBy + 2 days` when P7 ships) to `placedAt + notReceivedMaxDays`, COD additionally requiring paymentStatus `cod_collected` or status `delivered`; `not_as_described`/`wrong_item`/buyer `damaged` 15 days from `deliveredAt`; `counterfeit` 60 days; `seller_no_show` **closed before P7** (needs the slot); seller `damaged`/`wrong_item` until the case's `inspectBy`; `cod_refused_abuse` 7 days after a P4 refusal event. **Every window on a protected order also ends at `paidAt + 80 days`** (inside P5's `REFUND_WINDOW_DAYS = 85`).
  - `openerAllowed(reason, openerRole: "buyer" | "shop" ): boolean` per the table (`damaged`/`wrong_item` both; `cod_refused_abuse` shop; the rest buyer).
  - `evidenceRequired(reason): number` — 0 for `not_received`/`seller_no_show`; 1 for `not_as_described`/`damaged`/`wrong_item`; 2 for `counterfeit`; the `cod_refused_abuse` attempt-proof as 1.
  - `silenceOutcome(dispute, proof: ProofChecklist): SilenceVerdict` — the table's right column: `not_received` without delivery proof → `resolved_buyer` by system, with proof → `under_review`; `counterfeit` → always `under_review`; `cod_refused_abuse` → `resolved_seller`; opener-wins rows.
  - `proofChecklist(reason, records: { otpVerified, podWithin200m, preShipmentPhotos, packingBeforeShipment, snapshotMatch, brandAuthorisation, attemptProof, rescheduleAccepted }): ProofChecklist` — the art. 26 table as named boolean rows with `established` + `source`; `resolvedSellerNeedsOverride(checklist, reasonCode, note)` — a `resolved_seller` against a buyer-opened dispute with no established proof requires `reasonCode ∈ {buyer_abuse, item_conforms, delivery_proven}` **and** `note.length ≥ 50`.
  - `returnWaived({ basis, goodsValue, counterfeit, settings }): boolean` — goods ≤ `returnWaiverMaxGoodsValue` (10,000) or counterfeit.
- Consumes: Task 2's settings types.

- [ ] **Step 1: failing tests:** one window case per reason at both boundaries (last ms open, first ms closed), the COD `not_received` delivered-only rule, the 80-day protected cap overriding a longer counterfeit window (paidAt 2026-07-20 → closed 2026-10-08 even though 60 days from delivery runs later), `seller_no_show` and `late_delivery`-adjacent reads closed pre-P7; openerAllowed full matrix (7 reasons × 2 roles, whole-object); evidenceRequired by exact count; silence verdicts: `not_received` with OTP verified → `under_review`, without → `resolved_buyer`, POD at 201 m counts as no proof (the 200 m line), buyer `damaged` silence → `resolved_buyer` with return, seller-opened silence → `resolved_seller`; `resolvedSellerNeedsOverride`: 49-char note refused, 50 accepted, wrong reasonCode refused; `returnWaived` at 10,000 (yes) and 10,001 (no).
- [ ] **Step 2–4: implement, green, mutation** — flip the 200 m comparison → its case red; drop the 80-day cap → the counterfeit cap case red. Restore.
- [ ] **Step 5: commit** — `feat(cases): the dispute rulebook — windows, openers, silence defaults and the proof checklist`

### Task 5: The resale adjustment seam (P8's port, faked)

**Files:**
- Create: `packages/api/src/lib/resale.ts`
- Test: `packages/api/tests/int/resale-seam.int.spec.ts` (**new**)

**Interfaces:**
- Produces: `ResaleAdjuster = { adjustResellerCommission(req, purchaseOrder: string, delta: number, meta: { source: "dispute" | "cod_refusal"; disputeId?: string }): Promise<void> }`; `registerResaleAdjuster(a)` / `getResaleAdjuster()` — unregistered, it **throws** `ServiceError(ERROR_CODES.badRequest, 500, "resale adjuster unregistered — P8 not shipped")` so a resale-routed decision cannot silently drop a recovery; `resaleParties(order): null | { supplierShopId, resellerShopId, purchaseOrder }` — reads the order's resale snapshot fields when present, `null` always until P8 writes them; `FakeResaleAdjuster` with a call journal, the test double every P6 spec uses; `collusionMatch(buyerPhone: string | null, memberPhones: string[]): boolean` (normalised E.164 compare — pure, no country prefix logic of its own).
- Consumes: nothing. P8 registers the real adjuster later; the contract is this file (the P5 registry pattern, `registerMarketplaceProvider`'s sibling).

- [ ] **Step 1: failing tests:** unregistered adjuster throws with the message; the fake journals `(purchaseOrder, delta, meta)` exactly; `resaleParties` null on a plain order; `collusionMatch` on equal numbers with different spacing, false on different numbers, false on null.
- [ ] **Step 2–4: implement, green, mutation** — make the unregistered path a no-op → its test red. Restore.
- [ ] **Step 5: commit** — `feat(cases): the resale adjustment port and its fake, P8 to register the real one`

### Task 13: The P5 debt — reverse-netting when a netted refund finally fails

Parked by the P5 checkpoint ("reverse-netting on a refund's final failure — decide with P6") and the P5 release record. Today: `services/payouts.ts#netReceivables` posts `clawback_recovered` (debit `seller_releasable`, credit `seller_receivable`) for a refund-after-release while the order's money is still unpaid; if that refund then fails (`refund_failed` reverses `refund_submitted`, crediting `seller_receivable` back), the receivable lands at **−r** and the seller's releasable money stays short by r for a refund that never happened.

**Files:**
- Modify: `packages/api/src/services/ledger.ts` (one posting kind), `packages/api/src/services/refunds.ts` (the failed branch), `packages/api/src/services/payouts.ts` (planner comment + guard).
- Test: extend `packages/api/tests/int/refunds.int.spec.ts` and `payouts.int.spec.ts`.

**Interfaces:**
- Produces: posting kind `netting_reversed` in `POSTINGS` — debit `seller_receivable` k, credit `seller_releasable` k — the exact mirror of the netting's `clawback_recovered` entries; `applyRefundEvent`'s `failed` branch, after posting `refund_failed`, finds every `clawback_recovered` posting whose `sourceType/sourceId` equal the failed refund's (the netting is keyed on the refund's own source — `nettingPosting` in `payouts.ts` shows it) and posts one `netting_reversed` per netting, idempotency key derived as ever by `ledgerIdempotencyKey`, same transaction as the `refund_failed` posting.
- Produces: `plannedNettings` already skips refunds in its `failed` set; add the guard that a reversed netting (a `netting_reversed` exists for the key) is also excluded from the `netted` set arithmetic — the planner must neither re-net a failed refund nor count its reversed netting as live.
- Consumes: P5's landed `postingFor`, `transactionLines`, `orderTransactions`. **Ledger writes stay inside `services/ledger.ts`'s `postLedger`** — this task adds a kind to the table, not a second writer.

- [ ] **Step 1: failing tests:** the full sequence by exact balances on the worked order — charge, release, refund-after-release submitted (receivable r = 10,000), netting (`clawback_recovered`: releasable −10,000, receivable 0), **refund fails** → `refund_failed` + `netting_reversed` leave `seller_receivable` exactly 0 and `seller_releasable` restored to its pre-netting value; the next `releaseEligibleFunds` batch then pays the **full** D′ (amount asserted); `applyRefundEvent(failed)` delivered twice posts one `netting_reversed` (count the ledger rows); a failed refund that was never netted posts no `netting_reversed` (count 0 — paired with the positive case so absence is meaningful); `recoverSellerReceivables` the same night debits nothing for this refund (journal empty for the shop).
- [ ] **Step 2–4: implement, green, mutation** — key the reversal on the order instead of the refund's source → the twice-delivered case red (two refunds, one order). Restore.
- [ ] **Step 5: commit** — `fix(payments): reverse a refund's netting when the refund finally fails`

## Wave 3 — the schema and the clients' vocabulary

### Task 6: Six new collections, seven extensions, the generated types

**Files:**
- Create: `packages/api/src/collections/Disputes.ts`, `DisputeMessages.ts`, `DisputeEvidence.ts`, `DisputeEvidenceViews.ts`, `ShopStrikes.ts`, `RiskSignalOutbox.ts`.
- Create: `packages/api/src/services/caseNotifications.ts` — the 14 typed notifier signatures as logged no-ops (`notifyReturnRequested(req, kase)` … `notifyShopStrikeAdded(req, strike)`); call sites land in waves 4–7, Task 20 implements the bodies (P5's Task 21 precedent).
- Modify: `collections/ReturnCases.ts` (the spec's remaining fields), `Orders.ts` (`activeDispute`), `Reviews.ts` (`status`), `CommissionInvoices.ts` (`kind`, `creditsInvoice`, `sourceType`/`sourceId`), `ModerationLog.ts` (actions `dispute.resolve`, `dispute.request_info`, `dispute.redact_message`, `strike.revoke`; `targetType` + `dispute`), `Categories.ts` (`withdrawalExcluded` + its G1 guard), `plugins/storage.ts` (dispute-evidence on the **private** adapter — never the public `media` config), `payload.config.ts` (register the six — the one exception to Task 21's ownership, same as P5's Task 6, coordinated by wave order).
- Test: `packages/api/tests/int/case-collections.int.spec.ts` (**new**).

**Interfaces:**
- Produces, verbatim from the spec's Data model tables (field names and enum values are the contract later tasks compile against):
  - `Disputes`: `number` (unique), `order`/`shop`/`buyer` (required, indexed), `subject` (`goods|refund`), `items` (`{orderItem, quantity}`, min 1), `returnCase`, `reason` (7), `openedByType`/`openedBy`, `description` (20–2,000 chars, validated), `requestedOutcome` (4), `requestedAmount`, `paymentMethod` (`cod|mobile_money` snapshot), `amountAtStake`, `status` (8), `statusHistory`, `deadlines` (`submitBy`, `respondBy`, `reviewDueAt`), `proposal` group (`amount`, `returnRequired`, `byType`, `by`, `at`, `expiresAt`, `round` 1–3, `status` `open|accepted|rejected|lapsed`), `infoRequests` (number), `assignedTo`, `resolution` group (the contracts section's fields incl. `publicStatement: {fr, en}` and `reasonCode` 13 values), `effects` group (`returnCase`, `refund`, `creditNote`, `holdsReleased`, `strikes`, `riskSignals`, `reviewAction` `none|published|removed`, `certificate` relationship dispute-evidence), `resale` group (`supplierShop`, `resellerShop`, `purchaseOrder` text — P8 fills), `legalHold` (checkbox, admin — the purge job skips it), `lastMessageNotifiedAt` (date — the 10-min notification throttle's anchor). Access: read buyer + members of `shop` and `resale.supplierShop` + moderators; all writes closed (service via `overrideAccess`). **A partial unique index on `order` where `status not in` the terminal four** — in Payload/Mongo, an `indexes` entry with `partialFilterExpression` — enforces one active dispute per order at the DB layer.
  - `DisputeMessages`: `dispute` (required, indexed), `authorType` (5)/`author`, `kind` (6), `body` (≤ 2,000), `evidence` (hasMany dispute-evidence, ≤ 5 validated), `visibility` (`parties|staff`), `redactedAt`/`redactedBy`. Append-only: `create` closed (route-only via service), `update`/`delete` closed (redaction is a service write).
  - `DisputeEvidence`: an **upload** collection on the private adapter; `dispute`/`returnCase` (one required, validated), `uploadedByType`/`uploadedBy`, `kind` (5), `mimeType`/`size` mirrors, `sha256` (indexed), `capturedAt`, `exifStripped` (checkbox), `visibility` (`parties|staff`), `purgeAfter`. `enforceUploadLimits` hook: images `jpeg|png|webp|heic` ≤ 10 MB, video `mp4|mov` ≤ 50 MB, `pdf` ≤ 10 MB (the 60 s video rule is Task 14's, probed server-side where the container exposes duration, enforced client-side). Direct `read` of file bytes closed — bytes flow only through the signed-URL route.
  - `DisputeEvidenceViews`: clone of `VerificationDocumentViews` with `evidence` + `dispute`/`returnCase` in place of `document`/`request`; admin read; append-only.
  - `ShopStrikes`: `shop` (indexed), `kind` (6), `weight` (number — the service writes 1/2/3), `sourceType` (`dispute|return-case`)/`sourceId`, `status` (`active|expired|revoked`), `expiresAt`, `revokedBy`/`note`. Read: active shop members + moderators; writes closed.
  - `RiskSignalOutbox`: `subjectType` (`shop|user|phone`)/`subjectId`, `signal` (the 11 spec values), `severity` (`low|medium|high`), `sourceType`/`sourceId`, `occurredAt`, `consumedAt` (P9 sets it). Staff read; writes closed.
  - `ReturnCases` extension: `dispute`, `returnRequired`, `returnMethod` (3), `returnTracking` (text — the P7 `returnShipment` relationship lands with P7, Conflicts 3), `deadlines` group (5 dates), `shippedAt`/`receivedAt`/`inspectedAt`/`closedAt`, `items` rows gain `unitPrice`, `buyerCondition` (4), `inspection` group (`outcome` 5, `deductionAmount`, `note`), `refund` group exactly as the contracts view (incl. `sellerProof` group with `evidence` relationship), `creditNote` (relationship commission-invoices), `rejectionReason`.
  - `Orders.activeDispute` (relationship disputes, service-written); `Reviews.status` select `published|held_dispute|removed` default `published`, service-written (`access.update` unchanged — the hold is a service write); `CommissionInvoices`: `kind` select `invoice|credit_note` default `invoice`, `creditsInvoice` (self relationship), `sourceType` (`dispute|return-case`)/`sourceId`; `Categories.withdrawalExcluded` checkbox whose `beforeChange` refuses `true` until a G1 gate row exists (reads Task 2's settings).
- Consumes: Task 2's gate reader; P2's private storage plugin shape.

- [ ] **Step 1: failing tests:** per collection one access-matrix case (buyer/member/supplier-member/moderator/stranger read; every client write refused — count the refusals); the one-active-dispute partial index: two inserts with an open dispute on one order — second refused; a third insert succeeds once the first is `withdrawn` (the partial filter works); dispute `description` at 19 chars refused, 20 accepted; `DisputeMessages` evidence capped at 5; `DisputeEvidence` requires dispute or returnCase (neither refused, both accepted); `withdrawalExcluded: true` refused without G1, accepted with; `Reviews.status` defaults `published`; the P0 account-deletion anonymiser extended if dispute messages carry PII? — **no**: bodies are user content retained for the legal file (`purgeAfter` governs), assert instead that deletion nulls `openedBy`/`author` relationships following the P0 anonymiser's existing collection list (extend its spec with the two collections).
- [ ] **Step 2–3: implement, `bun run generate:types`, green** (commit the generated file with the change).
- [ ] **Step 4: mutation** — drop the partial filter from the unique index → the withdrawn-then-reopen case red. Restore.
- [ ] **Step 5: commit** — `feat(cases): the six case collections and the seven extensions`

### Task 7: Both clients' case vocabulary and every P6 translation

**Files:**
- Create: `packages/web/src/lib/case-status.ts` (+ test), `packages/mobile/src/lib/caseStatus.ts` (+ test).
- Modify: `packages/web/messages/{fr,en}.json` (namespaces `Returns`, `Disputes`), `packages/mobile/src/locales/{fr,en}.json` (`returns`, `disputes`): every screen string of the spec's Web/Mobile sections — status labels, reason cards with deadline lines, the step-5 review sentence verbatim in both languages ("The seller must prove delivery and conformity. BuyNSellem decides under its terms; you keep the right to go to court or a consumer association."), deduction/ proof/confirm copy, standing-card copy, moderator form labels, the per-`reasonCode` public-statement templates (FR and EN — they prefill the decision form).
- Test: `packages/api/tests/int/case-vocab-parity.int.spec.ts` (**new** — the `payment-vocab-parity` idiom).

**Interfaces:**
- Produces: explicit label maps — no `t(\`ns.${variable}\`)` — for `RETURN_CASE_STATUSES` (13), dispute statuses (8), reasons (7), bases (4), `requestedOutcome` (4), inspection outcomes (5), buyer conditions (4), reason codes (13), strike kinds (6), liable parties (6), return actions and dispute actions (the contracts unions) — each a `Record<ApiUnion, string-key>` so `check-types:tests` holds them to the API's own option lists (`keysOf<T>(record: Record<T, true>)`, the landed idiom).
- Consumes: Task 1's codes; Task 6's option lists (imported into the parity spec from `collections/*`, the rewire the P5 restoration gate established).

- [ ] **Step 1: failing tests:** the parity spec imports both clients' maps and the API option lists and holds them to each other cell for cell; whole-namespace byte-parity between web and mobile values for the shared vocab (the `payment-vocab-parity` 159-key precedent: pin the namespace key count by exact `toHaveLength`, with a comment naming the number and why); each client's own test covers its map totality.
- [ ] **Step 2–3: implement, green** — `bun test` both clients, the new API spec green.
- [ ] **Step 4: mutation** — drop one mobile reasonCode label → the parity spec names the cell. Restore.
- [ ] **Step 5: commit** — `feat(clients): the case vocabulary and every P6 translation`

## Wave 4 — strikes, returns creation, evidence, disputes core

### Task 8: `services/strikes.ts` + `services/riskSignals.ts`

**Files:**
- Create: `packages/api/src/services/strikes.ts`, `packages/api/src/services/riskSignals.ts`, `packages/api/src/jobs/expireStrikes.ts` (TaskConfig export only).
- Modify: `packages/api/src/lib/shopCapabilities.ts` / `lib/orderSettings.ts` (COD caps) and `services/checkoutPayment.ts` (protected eligibility + exposure caps) — the standing hooks, inert until `strikeEffectsEnabled`.
- Test: `packages/api/tests/int/strikes-signals.int.spec.ts` (**new**).

**Interfaces:**
- Produces: `addStrike(req, { shop, kind, sourceType, sourceId })` — weight from one exported table (`1` `no_response|unavailable_after_confirmation|dispute_lost`, `2` `refund_overdue|review_extortion`, `3` `counterfeit_confirmed`), `expiresAt = createdAt + 180 days`, idempotent per `{shop, kind, sourceType, sourceId}` while active, notifies `notifyShopStrikeAdded`; `shopStanding(payload, shopId): Promise<ShopStandingView>` (the contracts shape — `restrictions` all false while `!strikeEffectsEnabled`); `revokeStrikeRow(req, strikeId)` (the data half; the moderation wrapper is Task 18's); `expireStrikes(payload, now)` — `active` past `expiresAt` → `expired`, idempotent.
- Produces: `recordRiskSignal(req, { subjectType, subjectId, signal, severity, sourceType, sourceId })` — the **only** writer of `risk-signal-outbox`, called inside the causing transaction; severities fixed by one exported table transcribing the spec's Risk signals rows (11 signals).
- Produces: the standing effects, read where the money gates already live: at `activeWeight ≥ 3` the COD daily cap and the protected exposure cap are **halved** (`Math.floor(cap / 2)`); at `≥ 5` protected payment refuses `payment.shopNotEligible` for new orders and a moderation queue item with suggested `shop.suspend` is created (the P5 `refund_overdue` queue idiom). All of it behind `strikeEffectsEnabled`; recording and display are unconditional.
- Consumes: Tasks 2, 6; P5's `checkoutPayment` eligibility seam.

- [ ] **Step 1: failing tests:** weight table total (6 kinds, exact weights); 180-day expiry boundary (the job run at +180d−1ms leaves it, at +180d expires it; run twice, one transition); `shopStanding` sums only `active` weights; effects matrix with the flag **on**: weight 3 halves both caps by exact values (seed P4/P5 settings, assert the halved number), weight 5 refuses the intent by code and queues the review item; the same matrix with the flag **off**: full caps, intent allowed, restrictions `{false,false,false}` (whole-object); `recordRiskSignal` rows written inside a failing transaction roll back with it (forced failure → count 0, paired with the success count 1); signal severity table transcribed and asserted per signal.
- [ ] **Step 2–4: implement, green, mutation** — read `activeWeight ≥ 3` as `> 3` → the boundary case red. Restore.
- [ ] **Step 5: commit** — `feat(cases): strikes, standing, risk signals — recorded always, biting only behind G4`

### Task 9: `services/returns.ts` — the machine and the openings

**Files:**
- Create: `packages/api/src/services/returns.ts`, routes `app/(frontend)/api/orders/[id]/returns/route.ts`, `returns/[id]/route.ts`, `me/returns/route.ts`, `shops/[id]/returns/route.ts`.
- Modify: `packages/api/src/services/orders/withdrawal.ts` — `openWithdrawal` keeps its exact signature, its body now delegates to `services/returns.ts#openWithdrawal` (the P4 comment's promised swap).
- Test: `packages/api/tests/int/returns-open.int.spec.ts` (**new**).

**Interfaces:**
- Produces: `RETURN_TRANSITIONS` — the spec's table, one exported record checked by `assertTransition` (reuse the exported helper from `transitions.ts`): `requested → approved|rejected|cancelled`; `approved → awaiting_shipment|refund_pending`; `awaiting_shipment → in_transit|expired|cancelled`; `in_transit → received`; `received → inspected`; `inspected → refund_pending|disputed`; `refund_pending → refunded|disputed`; `refunded → closed`; `disputed → closed`; terminals `closed|rejected|expired|cancelled`. `moveCase(req, kase, to, { actorType, actor?, note? })` — the **only** status writer, appends `statusHistory`, throws `return.invalidTransition`.
- Produces: `openReturn(req, user, orderId, { basis: "withdrawal" | "late_delivery", items, reasonText?, returnMethod })`:
  - **withdrawal:** order `delivered|completed`; `now ≤ deliveredAt + orders.withdrawalDays` (`return.windowClosed`); items delivered, quantities ≤ ordered − already returned (`return.itemsInvalid`); no item of a `withdrawalExcluded` category (`return.notEligible`); no active case for the items (`return.alreadyOpen`).
  - **late_delivery:** order not `delivered`; needs P7's `promisedBy` — **refuses `return.notEligible` until P7 ships** (Task 4's `unavailableBeforeP7`); the branch is written and tested against a seeded `promisedBy` field read optionally, so P7 flips it on by writing data, not code.
  - In one transaction: case `requested → approved` (automatic when eligibility holds — the auto-reject path writes `rejected` + `rejectionReason` instead and still returns the view, spec: "the reason shown; the buyer can open a dispute against a rejection"); `deadlines.shipBy = approvedAt + returns.shipByDays` (15; `nonConformityShipByDays` 7 when basis `non_conformity` — created by Task 16, same function), `requestDeadline` from the basis window; `returnRequired` true except `unavailable`/waived; `orders.returnCase` + `completionHold: "return_case"` + items `return_requested` through `applyTransition` (the landed P4 wiring, now inside this service); for protected orders `createHold(req, { scope: "order", shop, order, reason: "return_open" })` (P5's); `recordRiskSignal` `serial_withdrawal` (user, low) on the third withdrawal case in 30 days (count query inside the transaction); notify `notifyReturnRequested` (shop) + `notifyReturnInstructions` (buyer) after commit. Late-delivery-nothing-shipped goes straight `refund_pending` and P4 cancels through the existing cancel service.
  - `openUnavailableCase(req, order)` — registered on P4's `order.cancelled` event (`registerOrderEventHandler`): when the cancellation reason is seller-side (P4's `seller_*` reasons, or the acceptance/seller timeout jobs) and the order was `confirmed`-or-later on COD or `paid` on protected: case `basis: "unavailable"`, `returnRequired: false`, straight `refund_pending`; **for protected it references P5's `order.cancelled` refund instead of issuing a second one** (find the live refund by source, store it on `refund.providerRefund`); records `unavailable_after_confirmation` (shop, low) and sets the variant's low-stock alert through `services/stock.ts`'s existing threshold field.
- Produces: `returnCaseView(payload, kase, caller)` → the contracts `ReturnCaseView`, whole-object pinned, `allowedActions` role-aware; the two list routes answering `{ rows, awaitingCount }`.
- Consumes: Tasks 2, 3 (deadlines use settings; refund preview uses `caseBreakdown`), 4, 6; P4's `applyTransition`/`requireOrderAudience`; P5's `createHold`; `nextNumber(payload, "RET", now)` outside the transaction (the landed rule).

- [ ] **Step 1: failing tests:** the transition table exhaustively — every allowed pair moves, every forbidden pair throws `return.invalidTransition` (generate the complement, count both sides); withdrawal happy path whole-object `ReturnCaseView` (deadlines by exact date math from a frozen clock); window boundary (last day opens, day 16 → auto-`rejected` with `rejectionReason`, **not** an error — and the view carries it); over-quantity and already-returned quantities `return.itemsInvalid`; excluded category `return.notEligible` (G1 row present + flag on the category); `late_delivery` pre-P7 `return.notEligible`, and with a seeded `promisedBy + 7 days` passed it opens; the P4 `openWithdrawal` signature still satisfied (its existing P4 spec keeps passing unchanged — run it); protected order creates the `return_open` hold (assert via `findActiveHold`), COD does not; third withdrawal in 30 days writes `serial_withdrawal` (count 1; second case count 0); `openUnavailableCase` on a paid protected order references the existing P5 refund (same refund id, refunds count 1); access matrix on the routes (buyer 200, member 200, stranger 404).
- [ ] **Step 2–4: implement, green, mutations** — count already-returned quantities from `requested` cases only → the active-case quantity test red; drop the hold creation from the transaction (post-commit) → forced-failure atomicity case red. Restore.
- [ ] **Step 5: commit** — `feat(cases): return cases — the machine, withdrawal and late-delivery openings, the unavailable hook`

### Task 14: `services/disputeEvidence.ts` — uploads, visibility, signed URLs, purge

**Files:**
- Create: `packages/api/src/services/disputeEvidence.ts`, `packages/api/src/lib/exifDate.ts`, routes `app/(frontend)/api/disputes/[id]/evidence/route.ts`, `disputes/[id]/evidence/[evidenceId]/url/route.ts`, `returns/[id]/evidence/route.ts`, `returns/[id]/evidence/[evidenceId]/url/route.ts`, `packages/api/src/jobs/purgeCaseEvidence.ts` (TaskConfig export only).
- Test: `packages/api/tests/int/dispute-evidence.int.spec.ts` (**new**), `packages/api/tests/int/exif-date.int.spec.ts` (**new**).

**Interfaces:**
- Produces: `uploadEvidence(req, { dispute?, returnCase?, user, file, kind })` — party-only (buyer or active shop/supplier member of the case); limits: 10 files per party per dispute, 30 total (`dispute.evidenceLimit` — **system rows excluded from both counts**, the certificate lives here too, Conflicts 6); 20 uploads per hour per user → `generic.rateLimited`; type/size by the collection hook (`upload.tooLarge`, `upload.invalidType`); for images: `sha256` of the **original** bytes (node:crypto), `capturedAt` from EXIF `DateTimeOriginal` via `lib/exifDate.ts` (a bounded TIFF/IFD scanner for tag 0x9003 over sharp's `metadata().exif` buffer — no new dependency), then re-encode through sharp **without** `.withMetadata()` so GPS and device EXIF never reach storage, `exifStripped: true`; videos/pdfs: sha256 + stored as-is (duration enforced client-side at 60 s, server-side when the mp4 `mvhd` box is readable — a bounded scan, refusing only when provably longer); a `sha256` already attached to **another account's** case records `evidence_reused` (user-or-shop, medium) inside the same transaction.
- Produces: `evidenceUrl(req, caller, evidenceId)` — `parties` visibility: the case's parties and moderators; `staff`: moderators only (a party gets 404, not 403 — existence is the leak); returns `createSignedDocumentUrl(doc, 300)` (5 minutes) and **always** writes a `dispute-evidence-views` row in the same operation; `setEvidenceVisibility(req, moderator, evidenceId, "staff")` for files showing third-party personal data.
- Produces: `purgeCaseEvidence(payload, now)` — deletes file bytes past `purgeAfter` (resolution + `evidenceRetentionDays` 1,095, stamped by Task 16), keeps the row's metadata and `sha256`, skips disputes with `legalHold`, idempotent.
- Consumes: Tasks 2, 6; `lib/privateFiles.ts`; sharp (already a Payload dependency).

- [ ] **Step 1: failing tests:** `exif-date`: a crafted minimal EXIF buffer with `DateTimeOriginal` parses to the exact date; a truncated buffer returns null without throwing; limits: the 11th file by one party → `dispute.evidenceLimit` (count 10 before, still 10 after); the 31st overall likewise; the 21st upload in an hour → `generic.rateLimited`; GPS strip: upload a fixture JPEG with GPS EXIF → stored bytes re-read through sharp show no `exif` buffer, `capturedAt` still the original's (positive + negative paired); duplicate `sha256` across accounts writes `evidence_reused` (count 1), same account re-upload writes none (count 0, paired); **the Review Focus 5 visibility matrix**: for a `staff` row — moderator URL 200 + a view row written; buyer URL 404 + **no** view row; buyer's `DisputeView.evidence` array omits the row entirely (assert the id absent from the stringified JSON); URL expiry value `expiresAt − now = 300 s`; purge: past-`purgeAfter` file bytes gone, row + sha256 kept, `legalHold` dispute untouched, run twice deletes once.
- [ ] **Step 2–4: implement, green, mutations** — serve `staff` rows to parties when `visibility` is undefined-ish (drop the default) → matrix red; skip the view write on cache-hit URLs → the always-logged case red. Restore.
- [ ] **Step 5: commit** — `feat(cases): private dispute evidence — stripped, hashed, counted, signed and logged`

### Task 15: `services/disputes.ts` — open, submit, thread, holds, review hold

**Files:**
- Create: `packages/api/src/services/disputes.ts`, routes `app/(frontend)/api/orders/[id]/disputes/route.ts`, `disputes/[id]/route.ts`, `disputes/[id]/submit/route.ts`, `disputes/[id]/messages/route.ts`, `me/disputes/route.ts`, `shops/[id]/disputes/route.ts`.
- Modify: `packages/api/src/services/orders/transitions.ts` — extend `UNRESERVED_TRANSITIONS` with `["shipped","disputed"]`, `["delivered","disputed"]` and `["delivered","returned"]` (opened here so Task 11 needs no context flag; the rows out of `disputed` are Task 16's); `packages/api/src/services/orders/delivery.ts` — `contestDelivery` opens a dispute when `disputes.enabled` (below); `packages/api/src/services/reviewRules.ts` — a review created on an order with an active dispute stores `status: "held_dispute"` and skips `updateUserRating`; a buyer may **replace** a held review once before publication (the second create updates the held row and stamps `replacedOnce`; a third refuses with the existing review-conflict translation).
- Test: `packages/api/tests/int/disputes-open.int.spec.ts` (**new**).

**Interfaces:**
- Produces: `DISPUTE_TRANSITIONS` (the spec's table, `assertTransition`-checked): `open → awaiting_seller|awaiting_buyer|withdrawn`; `awaiting_seller → resolved_buyer|awaiting_buyer|under_review|withdrawn`; `awaiting_buyer → resolved_seller|resolved_split|awaiting_seller|under_review|withdrawn`; `under_review → awaiting_seller|awaiting_buyer|resolved_buyer|resolved_seller|resolved_split`; terminals `resolved_*`, `withdrawn`. `moveDispute(req, dispute, to, actor)` the only status writer, `dispute.invalidTransition`.
- Produces: `openDispute(req, opener, orderId, input)` — the eligibility ladder in order: `disputes.enabled` (`dispute.disabled`); caller the buyer, or an active `owner|manager` of the seller-of-record shop for seller reasons (`dispute.notParty`); `openerAllowed` (`dispute.reasonNotAllowed`); `reasonWindow` (`dispute.windowClosed`); no active dispute (`dispute.alreadyOpen` — the partial index is the backstop, the service answers the code); items not in an active return case unless `returnCaseId` references it (`dispute.returnCaseActive`); then in one transaction: dispute `open` with `submitBy = now + submitAutoHours`, `paymentMethod` snapshot, `amountAtStake` = refundable ceiling (protected `buyerTotal − refundedAmount`; COD the paid goods + delivery), `resale` group filled from `resaleParties(order)` and the `resale_collusion_suspected` signal (high) when `collusionMatch` hits; `orders.activeDispute` + `completionHold: "dispute"`; a `shipped|delivered` order moves to `disputed` through `applyTransition` (a `completed` order keeps its status — only the hold is set); protected → `createHold(…, reason: "dispute_open")`; any `published` review of this order by the buyer → `held_dispute`; `order-events` `order.disputed` via the transition.
- Produces: `submitDispute(req, opener, disputeId)` — requires `evidenceRequired(reason)` uploaded rows (`dispute.evidenceRequired`), moves to `awaiting_seller` (buyer-opened) / `awaiting_buyer` (seller-opened), stamps `respondBy = now + respondHours`, notifies `notifyDisputeOpened` (counterparty); `openDeductionDispute(req, kase)` and `openRefundContestDispute(req, kase)` — the system entries Task 10/11 call: seller-opened `damaged` straight `under_review` (with `reviewDueAt`), and buyer-opened `subject: "refund"`, `reason: "not_received"` straight `awaiting_seller`.
- Produces: `postDisputeMessage(req, author, disputeId, { body, evidenceIds, visibility? })` — parties and moderators, refused in terminal states; throttled notification: `notifyDisputeMessage` fires only when `lastMessageNotifiedAt` is null or > 10 min old (stamped in the same write); `disputeView(payload, dispute, caller)` → the contracts `DisputeView` with role-aware `messages`/`evidence`/`systemEvidence`/`allowedActions`; `systemEvidence(order, caller)` assembled at read time from `order-events`, the handover group, P5 payment state, the order conversation pointer and (moderators only) the order `contract` snapshot — P7 POD slots null; the two list routes.
- Produces: the `contestDelivery` conversion — when `disputes.enabled`: instead of the P4 `reports` row, open + submit a buyer `not_received` dispute (description = the contest note or the fixed sentence "Buyer contested the delivery declaration.", the reason's lower window bound waived for this path — the declaration itself raises the question, Conflicts 8); when disabled: P4 behaviour byte-for-byte (its spec keeps passing).
- Consumes: Tasks 2, 4, 5, 6 (the `evidenceRequired` check at submit is a `dispute-evidence` collection count query — not Task 14's service, which lands in the same wave); P4's `applyTransition`, `requireOrderAudience`; P5's `createHold`; `nextNumber(payload, "DSP", now)`.

- [ ] **Step 1: failing tests:** the transition table exhaustively (both sides counted); the eligibility ladder one red case per code **in order** (each earlier gate passing); open on a protected `delivered` order: whole-object `DisputeView` (status `disputed` on the order, hold present, review held — three effects asserted by value in one case); a `completed` order keeps `completed` + gets the hold; `amountAtStake` by exact value for protected (worked order, one prior refund 5,000 → 38,260) and COD (42,000); collusion: buyer phone = a member's verified phone → signal written (count 1) at opening; submit without the required photo for `not_as_described` → `dispute.evidenceRequired`, with one → `awaiting_seller` + `respondBy` exact; message in `resolved_buyer` refused; the throttle: two messages 5 min apart → one notification call (the no-op journal from `caseNotifications` is `vi.mock`ed), 11 min → two; `contestDelivery` with disputes on opens the dispute (dispute count 1, reports count 0) and with disputes off writes the P4 report (reversed counts — paired); the P4 delivery spec still green; review replace-once: second held review replaces (count stays 1), third refused.
- [ ] **Step 2–4: implement, green, mutations** — set `completionHold` after the transaction → forced-failure atomicity red; let a manager of an unrelated shop open a seller dispute → `dispute.notParty` case red. Restore.
- [ ] **Step 5: commit** — `feat(cases): disputes — opening, submission, the thread and every side effect of opening`

## Wave 5 — the return lifecycle and the commission credit

### Task 10: `services/returns.ts` — ship, receive, inspect, deduct, presume

**Files:**
- Modify: `packages/api/src/services/returns.ts` (sole owner this wave).
- Create: routes `returns/[id]/{ship,pickup,receive,inspect,deduction,cancel}/route.ts`, `packages/api/src/jobs/advanceReturnCases.ts` (TaskConfig export only).
- Test: `packages/api/tests/int/returns-lifecycle.int.spec.ts` (**new**).

**Interfaces:**
- Produces: `shipReturn(req, buyer, caseId, { returnMethod, returnTracking?, evidenceIds? })` → `in_transit` (courier returns billed per basis — recorded in `statusHistory` note until P7 carries real shipments); `recordPickup(req, member, caseId)` (`seller_pickup`) → `in_transit`; `receiveReturn(req, member, caseId)` → `received`, `inspectBy = receivedAt + inspectDays` (3), `refundBy = receivedAt + refundDays` (15); `cancelReturn(req, buyer, caseId)` before `in_transit`; permissions exactly: ship/cancel buyer, receive/inspect shop `owner|manager|staff`, pickup seller — wrong role 403, stranger 404.
- Produces: `inspectReturn(req, member, caseId, { items })` — per item `outcome`, optional `deductionAmount` (requires evidence `return.deductionEvidenceRequired`, `deductionAllowed` from Task 3 → `return.deductionNotAllowed`/`return.itemsInvalid`); stock movements **in the same transaction** through `services/stock.ts` per the spec's table: `restock` → `return` +q; `damaged_by_buyer|damaged_in_transit|not_matching` → `return` +q then `loss` −q note "returned unsellable"; `missing`/waived → none; untracked variants skipped; resale movements on the supplier's variant. No deduction → `inspected → refund_pending`. With one: the undeducted amount proceeds at once (hand-off to Task 11's `executeRefund` by the status), buyer gets 72 h (`deduction` route `accept|contest`); contest or silence → `openDeductionDispute` (Task 15's) and the case → `disputed`.
- Produces: `advanceReturnCases(payload, now)` — every presumption, idempotent: `requestDeadline` closure (`requested → rejected` for stale un-approvable rows); `shipBy` passed → `expired` (the order resumes its P4 course: `completionHold` back to `none` **unless an active dispute holds it** — Review Focus 3's sibling, pinned here too); shipping proof or tracked return + no `receive` in `receivePresumptionDays` (7) → `received` with `actorType: "system"`; `inspectBy` passed → every item `restock`, full refund; `seller_pickup` not done by `pickupBy` (5 days) → return waived, refund proceeds; deduction silence at 72 h → the contest path. The `refundBy`-overdue and COD-confirm-silence sweeps are Task 11's: it extends `jobs/advanceReturnCases.ts` (a later wave — no contention) to also call its `advanceReturnRefunds`.
- Consumes: Tasks 3, 6, 9, 15 (`openDeductionDispute`); `services/stock.ts`.

- [ ] **Step 1: failing tests:** route permission matrix (4 verbs × buyer/staff-member/non-member — count the 403/404s and the 200s); inspect `restock` writes one `return` movement (+q exact), `damaged_by_buyer` writes `return` then `loss` (two rows, signs asserted), untracked variant zero rows (paired with a tracked +1); deduction without evidence → `return.deductionEvidenceRequired`; on `non_conformity` → `return.deductionNotAllowed`; deduction accepted → case `refund_pending` with breakdown `deduction: 4000` (whole-object refund group); contest → dispute exists (`openedByType: "system"`, status `under_review`) and case `disputed`; each presumption time-travelled to its boundary and **run twice** (second run changes nothing — assert row counts and `statusHistory` length); the expired case under an active dispute keeps `completionHold: "dispute"`.
- [ ] **Step 2–4: implement, green, mutations** — write the loss movement outside the transaction → forced-failure atomicity red; presume receipt without shipping proof → its paired negative case red. Restore.
- [ ] **Step 5: commit** — `feat(cases): the return lifecycle — custody, inspection, deductions and every presumption`

### Task 12: The commission credit — lines, series-A notes, the netting

**Files:**
- Modify: `packages/api/src/services/commission.ts`, `packages/api/src/lib/commissionInvoiceDocument.ts` (the bilingual credit-note template).
- Test: extend `packages/api/tests/int/commission-invoicing.int.spec.ts`.

**Interfaces:**
- Produces: `issueCommissionCredit(req, { order, kase, refundedGoods, sourceType, sourceId })` for COD orders with a commission line: writes a `commission-lines` row `kind: "credit"`, `amount = creditHt` from Task 3's `commissionCredit` (commissionBase = the charge line's `baseAmount`):
  - charge line not yet invoiced → the credit nets on the same weekly invoice (the landed `netting` planner already carries negative totals as `credit_carry_over` — assert, don't rebuild);
  - charge line invoiced (paid or not) → a **credit note**: `commission-invoices` row `kind: "credit_note"`, number `nextInvoiceNumber(req, "A", now)` (`BNS-A-{year}-{seq}`, no gaps, in-transaction), `creditsInvoice` → the original, `sourceType/sourceId` from the case or dispute, VAT at the **invoice's** rate, bilingual PDF through the renderer, and the credit line nets on the next weekly invoice;
  - no invoice within 90 days, or the shop closed → a staff finance queue row (the P5 moderation-queue idiom) carrying the credit and the shop's P4 commission payment number — BuyNSellem pays its own fee back by hand; the row is the obligation's record.
- Produces: `sellerLossFeeLine(req, dispute)` — a VAT-bearing `commission-lines` row on the next invoice when a **moderator** decides against the seller and `disputes.sellerLossFee > 0` (G4-gated by Task 2's settings; default 0 means the function exists and the tests prove it stays silent).
- Protected orders issue **no** credit note here: P5's `refund_submitted` already reverses the fee share (`platform_fee_unearned` before earning, `platform_revenue_commission` + `vat_payable` after) — Task 16 asserts that path; this task guards against double-crediting by refusing `issueCommissionCredit` on `paymentMethod: mobile_money` orders except the refund-after-release documentation case the spec names, where the note documents what P5's ledger already reversed.
- Consumes: Tasks 3, 6; P4's `netting`, `nextInvoiceNumber`, the weekly invoice run; `lib/textPdf.ts`.

- [ ] **Step 1: failing tests:** credit on an uninvoiced charge nets to the exact weekly total (charge 3,200 − credit 1,200 = 2,000 HT invoiced); on a paid invoice → credit note whole-object (number `BNS-A-2026-000001`, VAT 231, `creditsInvoice` id, `kind: "credit_note"`) and the next weekly run nets the line; the 90-day/closed-shop path writes the queue row with the payment number; `sellerLossFee` 0 writes nothing (count 0) and 500 with a G4 row writes the VAT-bearing line (paired); a protected order refuses the plain credit (and the refund-after-release case documents without re-netting — ledger rows counted unchanged); credit idempotent per `{sourceType, sourceId}` (run twice, one line).
- [ ] **Step 2–4: implement, green, mutation** — compute VAT at today's settings rate instead of the invoice's → the paid-invoice case (seeded with an older rate) red. Restore.
- [ ] **Step 5: commit** — `feat(cases): commission credits — netted, credit-noted in series A, or paid back by hand`

## Wave 6 — refund execution and the outcome engine

### Task 11: `services/returnRefunds.ts` — executing a case's refund on both channels

**Files:**
- Create: `packages/api/src/services/returnRefunds.ts` (own file, Conflicts 7; `services/returns.ts` re-exports `executeRefund` so the spec's name resolves), routes `returns/[id]/{refund-proof,confirm-refund,contest-refund}/route.ts`.
- Modify: `packages/api/src/jobs/advanceReturnCases.ts` — the TaskConfig also calls `advanceReturnRefunds(payload, now)` (this module's sweep: `handleRefundOverdue`, `handleCodConfirmSilence`).
- Test: `packages/api/tests/int/return-refunds.int.spec.ts` (**new**).

**Interfaces:**
- Produces: `executeRefund(req, kase)` — runs when a case reaches `refund_pending` (called by Task 10's transitions and the job):
  - **Protected:** P5 `requestRefund(req, { order, amount, breakdown, reason: basisToReason(kase), sourceType: "return-case", sourceId: kase.id })` — P5 derives key `return-case:{id}:1`; the case's breakdown maps to P5's `RefundBreakdown` (goods+delivery → seller share arithmetic stays P5's); reason `withdrawal` | `unavailable` | `dispute` per basis. On the P5 refund reaching `succeeded` (observed through a registered refund-event listener or a case sweep over the refund row — pick the sweep: `advanceReturnCases` already runs hourly and the refund row is local), the case `refunded → closed`, the `return_open` hold released. `refund.windowExpired` thrown by P5 → the case flips `refund.channel: "seller_direct"` and the COD path below takes over (**Review Focus 4**: re-running `executeRefund` on the switched case is a no-op — channel already set, zero `refunds` rows for the source — until P5-L4 enables the advance path).
  - **COD (`seller_direct`):** nothing to execute — the seller must refund by `refundBy`. `submitRefundProof(req, member, caseId, { method, transactionId?, amount, evidenceIds })` — `owner|manager`; `transactionId` required for `mtn_momo|orange_money`, `amount ≥ kase.refund.amount`, at least one evidence file (`payment_proof`) → `return.refundProofInvalid` naming the failed field; notifies `notifyRefundProofSubmitted`. `confirmRefund(req, buyer, caseId)` → `refunded → closed`. `contestRefund(req, buyer, caseId)` → `openRefundContestDispute` (Task 15's) and the case stays `refund_pending` with `contestedAt`.
  - **Closure effects, one place:** at `closed`, COD orders get `issueCommissionCredit` (Task 12); `completionHold` recomputed (`none` only when no active dispute — the two-holds rule); a fully refunded delivered order lands `returned` through `applyTransition` (`delivered → returned`, unreserved by Task 15; `disputed → returned` is Task 16's own call).
- Produces: the overdue hooks Task 10's job calls: `handleRefundOverdue(payload, kase, now)` — at `refundBy` without proof: strike `refund_overdue` (weight 2), signal `refund_overdue` (shop, high), a moderation queue item, `notifyRefundOverdue` (shop **and** buyer — `audience` payload), reminder every 3 days; at `refundBy + 30 days` the queue item upgrades with suggested `shop.suspend`; `handleCodConfirmSilence(payload, kase, now)` — proof present with a transaction id or cash receipt + `codRefundConfirmSilenceDays` (7) of buyer silence → `refunded → closed` with `actorType: "system"`.
- Consumes: Tasks 3, 8, 9, 10, 12, 15; P5's `requestRefund`, `releaseHold`, `findActiveHold`.

- [ ] **Step 1: failing tests:** protected full withdrawal end to end on the fake — one `refunds` row, source `return-case:{id}`, amount 43,260-component breakdown asserted; fake drives it `succeeded` → case `closed`, hold released (findActiveHold null — paired with its earlier presence), order `returned`; **the windowExpired switch pin**: P5 seeded 86 days old → channel `seller_direct`, refunds count **0**, `executeRefund` again → still 0 and channel unchanged; COD proof ladder (each `return.refundProofInvalid` field case); mobile-money proof without transactionId refused, cash without it accepted; confirm → closed + credit issued (Task 12's line exists, exact `creditHt`); contest → `subject: "refund"` dispute in `awaiting_seller` and `contestedAt` set; overdue at `refundBy`: strike (weight 2) + signal + queue item + one notification with `audience` both values fired — run the handler twice, every count still 1 (reminder cadence: day 3 fires the second reminder, asserted at exactly +3 d); silence closure at day 7 with a transaction id, **not** without one (paired).
- [ ] **Step 2–4: implement, green, mutations** — close on confirm without recomputing `completionHold` under an active dispute → the two-holds case red; accept a proof amount below the case amount → its case red. Restore.
- [ ] **Step 5: commit** — `feat(cases): case refunds — provider-keyed, seller-direct with proof, overdue consequences`

### Task 16: `services/disputeOutcome.ts` — `applyOutcome`, the one resolution engine

**Files:**
- Create: `packages/api/src/services/disputeOutcome.ts`, `packages/api/src/services/reviewRelease.ts`, `packages/api/src/jobs/publishHeldReviews.ts` (TaskConfig export only).
- Modify: `packages/api/src/services/orders/transitions.ts` — extend `UNRESERVED_TRANSITIONS` with `["disputed","shipped"]`, `["disputed","delivered"]`, `["disputed","returned"]`, `["disputed","cancelled"]` (the four rows out of `disputed`; Task 15 opened the rest).
- Test: `packages/api/tests/int/dispute-outcome.int.spec.ts` (**new**).

**Interfaces:**
- Produces: `applyOutcome(req, dispute, outcome: OutcomeInput, decidedByType: "system" | "agreement" | "moderator", decidedBy?)` — one transaction, **rerun-safe** (Review Focus 1: an already-resolved dispute returns the stored `effects` and writes nothing — the guard is the dispute's terminal status read inside the transaction):
  1. breakdown via Task 3 (`splitAllocation` for a moderator's `resolved_split` amount — goods first, then delivery, never the fee);
  2. a `return-cases` row `approved` (`basis: "non_conformity"`, `shipBy + nonConformityShipByDays` 7) when `returnRequired`, or `refund_pending` when not; a dispute on an existing case updates that case instead (`effects.returnCase` either way);
  3. the `decision` message with `publicStatement` (both languages stored);
  4. strikes and signals per the spec's COD-outcomes and Risk-signals tables: `dispute_lost` on `resolved_buyer` (**not** when resolved by agreement before `under_review` — check `statusHistory`), split-strike only for moderator + `reasonCode ∈ {item_not_conforming, seller_no_proof}`, `dispute_lost_seller`/`counterfeit_confirmed`/`seller_no_response`/`dispute_abuse_buyer`/`cod_refusal_abuse`/`review_extortion` signals with the spec's subjects and severities; `cod_refused_abuse → resolved_seller` additionally bumps the P4 buyer refusal score by **+2** and strips the review's verified flag;
  5. the review rule through `reviewRelease.ts`: `effects.reviewAction`, removal on `delivery_proven|buyer_abuse` (moderator-chosen `reviewAction: "removed"`) or `review_extortion` (forced), others scheduled to publish at `decidedAt + 24 h` (`publishHeldReviews(payload, now)` hourly, idempotent, calls `updateUserRating` on publish);
  6. money: **no refund** for `resolved_seller`; protected `resolved_buyer|resolved_split` → P5 `requestRefund(…, { reason: "dispute", sourceType: "dispute", sourceId: dispute.id, amount, breakdown })` (key `dispute:{id}:refund` — P5's one-live-refund rule is the idempotency); `refund.windowExpired` → the case flips `seller_direct` with the COD obligations (Task 11's path); COD → the case carries the seller-direct obligation; refund-after-release rides P5's clawback and Task 12 documents the credit note; `counterfeit_confirmed` → `takedownListing` + product archive through the P1 service, ids into the log metadata;
  7. the P5 `dispute_open` hold released **when no refund remains to execute** (protected split/full: after the refund row exists — release still blocked by `return_open` if a case holds it); `orders.activeDispute` cleared; `completionHold` recomputed under the two-holds rule (**Review Focus 3's pin lives here**: resolve with an active return case → `completionHold: "return_case"`, and `jobs/completeOrders` still skips the order); the order handed back through `applyTransition`: `disputed → delivered` (or `shipped`), `→ returned` after a full refund of delivered goods, `→ cancelled` for `not_received` resolved for the buyer on an undelivered order;
  8. resale: `liableParty: "reseller"` → `getResaleAdjuster().adjustResellerCommission(req, purchaseOrder, −refundAmount, { source: "dispute", disputeId })` (the fake journals it); strikes routed to the liable shop; `courier` liability recorded, recovery out of scope;
  9. `purgeAfter` stamped on the **party** evidence rows (resolution + 1,095 d; the certificate carries none — Conflicts 6); `queueCertificateRender(req, dispute)` through the registry seam (`registerCertificateRenderer` — Task 19 registers, Task 21 wires the slug; the P5 `registerRefundSubmissionQueue` precedent); `notifyDisputeResolved` (both parties + supplier in resale) after commit.
- Consumes: Tasks 3, 4, 5, 8, 9, 12, 15; P5 `requestRefund`/`releaseHold`; P1 `takedownListing`; P4 `applyTransition`, buyer-phone scores.
- **Links out:** Task 17 (agreement + silence call this), Task 18 (the moderator calls this inside `resolveDispute`'s transaction).

- [ ] **Step 1: failing tests:** **the rerun pin** — `applyOutcome` twice on a protected full `resolved_buyer`: one `refunds` row (`dispute:{id}:refund` source), one strike, one signal set, one decision message, one certificate queue call (every count asserted at 1 after run 2); the two-holds matrix (resolve with/without an active case × case closes with/without an active dispute → `completionHold` 4-cell whole-object); order hand-back per spec row: `disputed → returned` on full refund of delivered goods, `→ cancelled` on undelivered `not_received`, `→ delivered` then completed by `completeOrders` once the window elapses (time-travel), a `completed` order untouched; split on protected: partial refund amount exact, fee untouched, commission reduced pro rata at invoice time (seed Task 12, assert the reduced base); agreement before `under_review` → **no** strike (count 0, paired with the moderator-decided count 1); `counterfeit_confirmed` → listing taken down + archived + signal high; reseller liability → the fake adjuster journals `(po, −amount, {source: "dispute"})`; `cod_refused_abuse` → refusal score +2 and verified flag removed (both by value); review published at +24 h by the job (run at +23 h: still held — paired), extortion review removed; `windowExpired` on the dispute refund flips the created case `seller_direct` with zero refunds rows.
- [ ] **Step 2–4: implement, green, mutations** — clear `completionHold` to `none` unconditionally → the matrix red; strike on agreement → its paired case red. Restore.
- [ ] **Step 5: commit** — `feat(cases): applyOutcome — one engine for agreement, silence and arbitration`

## Wave 7 — party actions, arbitration, the certificate

### Task 17: Respond, propose, escalate, withdraw — and `advanceDisputes`

**Files:**
- Modify: `packages/api/src/services/disputes.ts` (sole owner this wave).
- Create: routes `disputes/[id]/{respond,proposal,escalate,withdraw}/route.ts`, `packages/api/src/jobs/advanceDisputes.ts` (TaskConfig export only).
- Test: `packages/api/tests/int/disputes-actions.int.spec.ts` (**new**).

**Interfaces:**
- Produces: `respondToDispute(req, counterparty, disputeId, { action, amount?, returnRequired?, message?, evidenceIds? })` — in `awaiting_*` only: `accept` → full refund `resolved_buyer` by agreement (or seller-opened: no refund `resolved_seller`) through `applyOutcome(…, "agreement")`; `propose` → a `proposal` message, the group updated (`round + 1`, `expiresAt = now + proposalHours` 72, `dispute.proposalInvalid` when over `maxProposalRounds` 3 or amount > refundable or ≤ 0), status to the other side's `awaiting_*`; `contest` → requires a message and ≥ 1 evidence file or a system-evidence reference → `under_review`, `reviewDueAt = businessDaysAfter(now, 5)`.
- Produces: `answerProposal(req, receiver, disputeId, { action })` — `accept` → `resolved_split` (or `resolved_buyer` when the amount equals the full refundable) by agreement via `applyOutcome`; `reject` → `under_review`. `escalateDispute` (either party, from `awaiting_*`, after ≥ 1 exchange — else `dispute.invalidTransition`); `withdrawDispute` (opener, before resolution; a withdrawn dispute cannot reopen for the same reason + items — `openDispute` gains the check, `dispute.alreadyOpen`'s sibling under `dispute.reasonNotAllowed`? **No**: the spec treats it as a fresh refusal — reuse `dispute.alreadyOpen` with the withdrawn row as source, asserted by code).
- Produces: `advanceDisputes(payload, now)` — idempotent: auto-submit at `submitBy` (unsubmitted `open` disputes with the evidence present; without it → `withdrawn` by system with a history note); `reminderHours` 48 → `notifyDisputeDeadlineReminder` once (stamped); at `respondBy` the silence default via Task 4's `silenceOutcome` + Task 16's `applyOutcome(…, "system")` — **inside a per-dispute transaction that re-reads the status first** (Review Focus 2); proposal lapse (`expiresAt` → `lapsed` → `under_review`); `reviewDueAt` breach → admin alert (`notifyDisputeReviewOverdue`); the 30-day and `paidAt + 80 d` priority alerts.
- Consumes: Tasks 4, 14 (evidence counts), 15, 16.

- [ ] **Step 1: failing tests:** accept → `resolved_buyer` by agreement, refund row exists, **no strike** (the agreement rule re-pinned at the caller); propose round 4 → `dispute.proposalInvalid`; proposal accept at the full refundable → `resolved_buyer` not `resolved_split` (boundary); contest without evidence → `dispute.evidenceRequired`; escalate before any exchange refused; withdraw then reopen same reason+items → refused by code; **the race pin**: seed a dispute at `respondBy`, apply a response, run `advanceDisputes` with the stale selection (drive the seam: select first, respond, then let the job proceed) → the response's state stands, no silence default applied (one terminal path — `statusHistory` counted); silence on `not_received` with no proof → `resolved_buyer` by system with the refund row; silence on `counterfeit` → `under_review` (never default-decided); auto-submit at 24 h; the whole job run twice at each boundary → every count unchanged; reminder fires once at 48 h (stamp asserted).
- [ ] **Step 2–4: implement, green, mutation** — drop the in-transaction status re-read (decide from the selection) → the race pin red. Restore.
- [ ] **Step 5: commit** — `feat(cases): party actions, proposals and the deadline job that never decides twice`

### Task 18: Moderator arbitration — `resolveDispute`, the queue, the sheet

**Files:**
- Modify: `packages/api/src/services/moderation.ts`.
- Create: routes `app/(frontend)/api/moderation/disputes/route.ts`, `moderation/disputes/[id]/route.ts`; extend `moderation/summary` (`disputesPending`, `disputesOverdue`).
- Test: `packages/api/tests/int/moderation-disputes.int.spec.ts` (**new**).

**Interfaces:**
- Produces: `requestDisputeInfo(payload, actor, disputeId, { from, message })` — moderator; `under_review` only (`moderation.invalidTransition`); `infoRequests < maxInfoRequests` 2; posts the `info_request` message, moves to `awaiting_{from}` with a 72 h deadline (silence returns to `under_review` with the evidence at hand — Task 17's job already does, this stamps the deadline), `writeLog("dispute.request_info", …)` in the transaction.
- Produces: `resolveDispute(payload, actor, disputeId, input)` — the ladder, each its code: `assertModerator`; the actor neither the buyer nor an active member of any shop on the dispute (`moderation.forbidden`); status `under_review` (`moderation.invalidTransition`); amount bounds — `resolved_buyer` needs `refundAmount > 0`, `resolved_seller` exactly 0, `resolved_split` strictly between, all `≤ refundable` (`dispute.refundExceedsOrder`); `refundAmount > moderatorRefundLimit` (250,000) needs an admin (`moderation.rankTooLow`); the burden-of-proof override (`resolvedSellerNeedsOverride` — `moderation.reasonRequired` when the note or code fails); then **one transaction**: `applyOutcome(…, "moderator", actor)` + `writeLog` action `dispute.resolve`, `targetType: "dispute"`, `reason: reasonCode`, metadata `{ outcome, refundAmount, breakdown, returnRequired, returnShippingPaidBy, liableParty, paymentMethod, returnCaseId, refundId, creditNoteId, strikeIds, holdIdsReleased, riskSignalIds, reviewAction, proofChecklist }` — the spec's exact list, asserted whole-object.
- Produces: `redactDisputeMessage(payload, actor, messageId, { note })` — body → "Message removed by moderation" (the stored body nulled, `redactedAt/By` set), the **original body only in the log metadata**, action `dispute.redact_message` (Conflicts 5); `revokeStrike(payload, actor, strikeId, { note })` — admin, action `strike.revoke`; `assignDispute`; the queue route (filters + nearest-deadline sort, `ModerationDisputeRow[]`), the sheet (`ModerationDisputeSheet` — `proofChecklist` from Task 4 over the loaded records, `partyHistory` from P4 scores + 12-month dispute count + Task 8's standing + loss rate), and the `preview` action (Task 3's math, written nowhere — asserted by zero writes).
- Consumes: Tasks 3, 4, 8, 16; the `moderationRoute` idiom, `ModerationError`, `writeLog`.

- [ ] **Step 1: failing tests:** the refusal ladder one case per code in order; a moderator who is a shop member → `moderation.forbidden`; 250,001 by moderator refused, by admin accepted (boundary 250,000 moderator-allowed); the no-proof `resolved_seller` with a 49-char note refused, 50 + `buyer_abuse` accepted; the log metadata whole-object (every key present with the real ids — the P5 "completeness" lesson); **atomicity**: a forced failure after the dispute update rolls back the case, strikes, signals and log together (counts all 0); redaction: party view shows `redacted: true` + null body and the original string absent from the stringified party JSON, the log metadata carries it (Review Focus 5's second pin); queue sorted by nearest deadline (three seeded, order asserted); info request #3 refused; preview writes nothing (collection counts unchanged) and returns the exact breakdown.
- [ ] **Step 2–4: implement, green, mutation** — write the log outside the transaction → the atomicity case red. Restore.
- [ ] **Step 5: commit** — `feat(moderation): dispute arbitration — the queue, the sheet, the transactional decision`

### Task 19: The decision certificate

**Files:**
- Create: `packages/api/src/lib/disputeCertificateDocument.ts`, `packages/api/src/services/disputeCertificates.ts`, `packages/api/src/jobs/renderDisputeCertificate.ts` (TaskConfig export only).
- Test: `packages/api/tests/int/dispute-certificates.int.spec.ts` (**new**).

**Interfaces:**
- Produces: `renderDisputeCertificate(req, disputeId)` — idempotent (an existing `effects.certificate` returns it): builds the bilingual document (FR then EN, `lib/textPdf.ts`, the buyer-fee `storePdf` idiom) containing exactly the spec's list — the order (number, date, items), the decision (outcome, amounts, `publicStatement` both languages), **which proof was relied on** (the checklist rows marked established at decision time, from the log metadata), the shop's name, handle, RCCM and NIU when provided, and the recourse statement bilingual: "Cette décision est contractuelle et ne vous prive d'aucun recours : vous pouvez saisir une association de consommateurs ou les tribunaux. / This decision is contractual and removes no recourse: you may take the claim to a consumer association or the courts." The owner's legal identity is **never** in the certificate (court-only disclosure — assert its absence). Stored as a `dispute-evidence` row (`kind: "document"`, `uploadedByType: "system"`, `visibility: "parties"`, excluded from party limits — Conflicts 6), linked at `effects.certificate`; downloadable through Task 14's signed-URL route.
- Produces: registers itself on Task 16's `registerCertificateRenderer` seam.
- Consumes: Tasks 6, 14, 16, 18 (the log metadata's `proofChecklist`); P1 shop fields; `lib/textPdf.ts`.

- [ ] **Step 1: failing tests:** rendered once per dispute (job run twice → one evidence row, same id on `effects.certificate`); the PDF's extracted text contains the number, both recourse sentences, the RCCM when set and the sentence "RCCM" absent when the shop has none (paired); the owner's verified legal name (seed one) **absent** from the bytes while the shop name is present (paired positive/negative); the buyer can fetch the signed URL, a stranger 404; the certificate does not count against the 10-per-party evidence limit (upload 10 then render — 11 rows, no `dispute.evidenceLimit`).
- [ ] **Step 2–4: implement, green, mutation** — include the owner identity line → its absence case red. Restore.
- [ ] **Step 5: commit** — `feat(cases): the bilingual decision certificate, rendered once, party-visible, court-ready`

## Wave 8 — notifications and the jobs wiring

### Task 20: The fourteen case workflows and their push data

**Files:**
- Modify: `packages/api/src/scripts/syncNotificationWorkflows.ts`, `packages/api/src/hooks/notificationEvents.ts`, `packages/api/src/services/caseNotifications.ts` (the Task 6 no-ops become real).
- Test: extend `packages/api/tests/int/notification-workflows.int.spec.ts`.

**Interfaces:**
- Produces: the spec's workflow table verbatim — `return-requested` (shop owner+managers; in-app, push, email — **takes over the shop audience of P4's `order-withdrawal-requested`**, which stays declared but stops firing for the shop, Conflicts 10), `return-instructions` (buyer; in-app, email — address or pickup, `shipBy`, who pays), `return-received` / `return-inspected` (buyer; in-app, push — the inspection payload carries the deduction when present), `refund-proof-submitted` (buyer; in-app, push), `refund-overdue` (shop owner **and** buyer; in-app, push, email — `audience` in the payload schema from day one, the P4 lesson), `dispute-opened` (counterparty), `dispute-message` (other party; throttled upstream by Task 15's stamp), `dispute-deadline-reminder` (the party expected to act; push, email; 24 h before `respondBy`), `dispute-info-requested`, `dispute-escalated` (both parties; in-app), `dispute-resolved` (both parties and the supplier in resale; in-app, push, email — outcome and next steps), `dispute-review-overdue` (admins; email), `shop-strike-added` (shop owner; in-app, email — reason and expiry). All copy bilingual in one body string (the landed `payment-succeeded` idiom).
- Produces: push data routes in `hooks/notificationEvents.ts`: disputes → `/disputes/{id}`, returns → `/returns/{id}`, seller-side rows → `/seller/returns/{id}` and `/seller/disputes` by `audience`.
- Consumes: every notifier call site from waves 4–7 (they call the Task 6 signatures; this task implements them and their tests stop mocking).

- [ ] **Step 1: failing tests:** every workflow id declared and payload-schema'd (count 14 new); each notifier fires its workflow with the exact payload (whole-object one per notifier); `refund-overdue` fires twice with `audience: "buyer"` and `"shop"` and the deep-link hook routes each to its own path (4 routing cases); `dispute-resolved` in resale reaches three recipients (count).
- [ ] **Step 2–4: implement, green, mutation** — drop `audience` from the overdue payload → the routing case red. Restore.
- [ ] **Step 5: commit** — `feat(cases): the fourteen case workflows, audience-carrying from day one`

### Task 21: Jobs wiring — the `cases` queue (sole owner of `jobs/index.ts` + `payload.config.ts`)

**Files:**
- Modify: `packages/api/src/jobs/index.ts`, `packages/api/src/payload.config.ts`.
- Test: `packages/api/tests/int/case-jobs.int.spec.ts` (**new**).

**Interfaces:**
- Produces: registration of `advanceDisputes`, `advanceReturnCases`, `renderDisputeCertificate` (queued), `publishHeldReviews`, `expireStrikes`, `purgeCaseEvidence`; `autoRun` gains `{ cron: "*/5 * * * *", queue: "cases", limit: 100 }` (the spec's row); schedules on the `cases` queue: `advanceDisputes` every 15 min (`*/15 * * * *`), `advanceReturnCases` hourly (`0 * * * *`), `publishHeldReviews` hourly, `expireStrikes` daily 01:00 Douala (`0 0 * * *` UTC), `purgeCaseEvidence` daily 03:30 Douala (`30 2 * * *` UTC — commented like P5's rows); wires Task 16's certificate seam to the real queue slug; `bun run generate:types` for the task slugs. The spec's `submitDisputeRefunds` is **not** a new job — P5's `submitRefund` already carries it (Conflicts 2).
- Consumes: every TaskConfig export from Tasks 8, 10, 14, 16, 17, 19.

- [ ] **Step 1: failing test:** `every P6 job is registered in payload.config.ts with its queue` — import the config, assert the six slugs, their cron rows and the `cases` autoRun row (the P4 class of defect: a job that exists and is scheduled nowhere fails here).
- [ ] **Step 2–4: implement, generate:types, green, mutation** — drop the `cases` autoRun row → red. Restore.
- [ ] **Step 5: commit** — `feat(cases): the cases queue and every P6 job on its schedule`

## Wave 9 — the backend checkpoint

### Task 22: Backend checkpoint

**Files:** none unless a defect is found; the report is the deliverable. The P4/P5 checkpoints each earned their seat (P5's found nine defects, two of them money).

- [ ] **Step 1: trace two orders end to end, file by file.** (a) COD withdrawal: deliver (P4) → `openWithdrawal` → approved → ship → receive → inspect with a 4,000 deduction → buyer contests → system `damaged` dispute `under_review` → moderator split 11,000 → case refund, seller proof, buyer silence closure at day 7 → commission credit 1,431 on the next invoice. (b) Protected `not_as_described`: open (hold, `disputed`, review held) → seller proposes, buyer rejects → `under_review` → moderator `resolved_split` 20,000 → P5 refund `dispute:{id}:refund` on the fake → hold released → order completes on the reduced base → certificate downloadable. Confirm every seam's types and every money number against Task 3's worked order.
- [ ] **Step 2: grep the invariants and quote the output** — ledger postings only via `services/ledger.ts` (`grep -rn "postLedger\|ledger-transactions" packages/api/src --include="*.ts"` shows only ledger.ts internals and its callers through the exported API); order status writes only through `applyTransition`; `risk-signal-outbox` written only by `recordRiskSignal`; no P6 file imports `fakeMarketplace` outside tests; every one of the 19 codes thrown somewhere; `audience` on every mixed-recipient workflow; **no new country constant** (`grep -rn "Douala\|Cameroon\|\"CM\"\|237" packages/api/src --include="*.ts"` diffed against P5's inventory — new hits justified or removed).
- [ ] **Step 3: every reference resolves** — route paths vs the contracts section, workflow ids vs the sync script, job slugs vs config, deep-link routes vs the (not yet built) client screens recorded as wave 10–12 obligations.
- [ ] **Step 4: suites + the four ceilings on a quiet tree, quoted** — `bun run test:int`, `check-types`, and the four AGENTS.md commands verbatim with their numbers.
- [ ] **Step 5: report; fix the smallest thing that closes any defect, with a test.** Drift sweep: any constant declared twice (the P5 D-9 lesson — 72 h, 15 days, 250,000 are the candidates).

## Wave 10 — web

House rules for all four: TanStack Query hooks in `src/hooks` with exported keys; screens call hooks; `react-hook-form` + zod for forms; logic that needs pinning in a pure module under `src/lib` with its own `bun test` (no render harness exists); Server Components by default; every money number rendered from the server's view, never recomputed client-side.

### Task 23: Web — the buyer's returns

**Files:** modify `packages/web/src/app/purchases/[id]/*` (the action surfaces: "Return items" with remaining days, "Cancel for late delivery" when eligible, "Report a problem" → `/purchases/{id}/problem` or `/contact?order=` by `disputesEnabled`, the active case/dispute banner; `withdrawal-dialog.tsx` retires into a link to the new page); create `app/purchases/[id]/return/*`, `app/returns/[id]/*`, `app/account/disputes/*` (the combined returns+disputes list); create `src/hooks/use-returns.ts` (+ keys), `src/lib/return-flow.ts` (+ test). Keys in both message files (namespace `Returns` — Task 7 placed the vocab; this task adds only screen glue).
**Consumes:** `ReturnCaseView`/`ReturnListRow` and the routes verbatim; `useAppConfig().disputesEnabled`; Task 7's maps.
- [ ] Pure module first (+ test): `returnFlowState(view, now)` — which step, which action, countdown strings' inputs, deduction-response window remaining, "who pays return shipping" line per basis (from the view's breakdown, not re-derived).
- [ ] The return page: item/quantity picker (zod: quantities within the view's remaining), optional reason, method, the summary (refund amount, payer, `shipBy`) — all from a server-computed preview (`POST` dry-run? No: the view's breakdown fields — the API returns the would-be case on 201; the summary before submit uses the settings surfaced in `GET /api/public/config` + the order's own numbers, labelled "estimated"). `/returns/[id]`: status tracker, instructions, ship form, deduction accept/contest, proof confirm/contest.
- [ ] `bun test`, `check-types`, key gate, biome; mutation: compute the refund client-side instead of rendering the view's → its test red.
- [ ] Commit — `feat(web): returns — open, track, respond, confirm`

### Task 24: Web — the shared dispute thread and the problem flow

**Files:** create `packages/web/src/app/disputes/[id]/*` (the one thread buyers, sellers and suppliers share), `app/purchases/[id]/problem/*` (the five-step flow); `src/hooks/use-disputes.ts`; `src/lib/dispute-flow.ts` (+ test); evidence upload component (progress, per-file removal before submit, the Task 14 limits mirrored as zod constants imported from one place).
**Consumes:** `DisputeView` verbatim (header: number, status chip, "Seller has until {date}" countdown from `deadlines.respondBy`, amount at stake, protected badge; timeline merging `messages` by `kind`; evidence gallery opening signed URLs; role-aware action bar from `allowedActions` — **never** recomputed; proposal card; decision card with `publicStatement[locale]`, money effects and certificate download via the URL route).
- [ ] Pure module first (+ test): `disputeActionsFor(view)` passes `allowedActions` through with display grouping only (a source-scan test pins that no action is derived client-side); step-flow reducer for the problem wizard (reasons filtered by the server's windows — the open-reasons list comes from a `GET /api/orders/{id}/disputes` OPTIONS-style query? **No new endpoint**: the reason cards render every reason with its window line and submission relies on the server's `dispute.windowClosed` — the card shows the deadline from order dates + config, marked informational).
- [ ] Step 5's review sentence verbatim from the `Disputes` namespace (Task 7 placed it); `dispute.disabled` → the `/contact` redirect path.
- [ ] Mutation: derive an action from `status` client-side → the source-scan pin red.
- [ ] Commit — `feat(web): the dispute thread and the report-a-problem flow`

### Task 25: Web — the seller's returns and disputes

**Files:** create `packages/web/src/app/seller/returns/*` (table: status, deadline, overdue filter), `seller/returns/[id]/*` (receive, per-item inspect with evidence, deduction, refund proof form — transactionId required per method), `seller/disputes/*` (table + the standing card: active strikes, weight, restrictions, expiry dates; rows open `/disputes/[id]`); `src/hooks/use-seller-cases.ts`; sidebar entries under Orders (Returns, Disputes) with `awaitingCount` badges.
**Consumes:** the shop list routes' `{ rows, awaitingCount, standing }`; Task 24's thread (rows link into it); `ShopStandingView` rendered as given (`restrictions` only when `effectsEnabled`).
- [ ] Inspect form: per-item outcome select, deduction field disabled for `non_conformity` (the server refuses too — the UI mirrors, one zod schema), evidence required when a deduction is set.
- [ ] Mutation: show restrictions while `effectsEnabled: false` → its test red.
- [ ] Commit — `feat(web): seller returns, disputes and the standing card`

### Task 26: Web — the moderation disputes area

**Files:** create `packages/web/src/app/moderation/disputes/*` (queue: number, reason, payment method, amount, status, deadline red when overdue, assignee, age; filters; "Assign to me") and `moderation/disputes/[id]/*` (the workspace: left — thread + evidence viewer with zoom, video, EXIF `capturedAt`, the `sha256Reused` warning; right — order snapshot, system evidence, proof checklist, party history, resale roles; the decision form; the confirmation dialog listing **every** money and standing effect from the `preview` action before submit; Request info; Redact); `src/hooks/use-moderation-disputes.ts`; the moderation layout nav gains Disputes.
**Consumes:** `ModerationDisputeRow`, `ModerationDisputeSheet`, the `POST` actions verbatim; the `preview` action is the **only** source of the live breakdown (house rule: no client money math).
- [ ] Pure module (+ test): `decisionFormGuards(sheet, input)` — mirrors the server ladder for inline UX (amount bounds per outcome, the 250,000 "admin only" warning, the 50-char note rule) while submission still trusts the server.
- [ ] Mutation: compute the breakdown preview locally → its source-scan pin red.
- [ ] Commit — `feat(web): the arbitration workspace`

## Wave 11 — mobile

Same house rules; FlashList for lists; `expo-image-picker` for evidence (camera + library), images resized to ≤ 2048 px JPEG quality 0.8 before upload, videos ≤ 60 s refused client-side, per-file retry; `accessibilityLabel` + 44 px targets.

### Task 27: Mobile — the buyer's returns and the problem flow

**Files:** create `packages/mobile/app/purchases/[id]/return.tsx` (supersedes `withdrawal.tsx`, which becomes a re-export so P4 deep links keep resolving), `app/purchases/[id]/problem.tsx` (the five-step flow), `app/returns/[id].tsx`, `app/account/disputes.tsx`; `src/hooks/useReturns.ts`, `useDisputes.ts`; `src/lib/caseFlow.ts` (+ test — the Task 23/24 pure modules' mobile twin, compared by the parity family where shared); `src/lib/evidenceUpload.ts` (+ test: resize/quality/duration constants and the retry decision).
**Consumes:** the same views; `{{x}}` interpolation; purchase screen gains the three actions + banner.
- [ ] Mutation: drop the 60 s video refusal → `evidenceUpload` test red.
- [ ] Commit — `feat(mobile): returns and the report-a-problem flow`

### Task 28: Mobile — the dispute thread and moderation

**Files:** create `packages/mobile/app/disputes/[id].tsx` (the shared thread — timeline, evidence gallery via signed URLs, action bar from `allowedActions`, proposal card, decision card with certificate download), `app/moderation/disputes/index.tsx` and `app/moderation/disputes/[id].tsx` on `ModerationScreen` + `DecisionSheet` (the sheet shows the same `preview` effects summary as web before resolve); `app/moderation/index.tsx` gains the Disputes section with the overdue count (`moderation/summary`'s new fields); `src/hooks/useModerationDisputes.ts`.
- [ ] Mutation: derive an action from `status` → the source-scan pin red.
- [ ] Commit — `feat(mobile): the dispute thread and the arbitration sheet`

### Task 29: Mobile — the seller's returns and disputes

**Files:** create `packages/mobile/app/seller/returns/index.tsx`, `app/seller/returns/[id].tsx` (receive, inspect, deduction, refund proof with the camera for the receipt), `app/seller/disputes/index.tsx` (standing card; rows open `app/disputes/[id].tsx`); the Shop hub gains Returns and Disputes tiles with `awaitingCount` badges; `src/hooks/useSellerCases.ts`.
- [ ] Mutation: badge from a local computation instead of `awaitingCount` → red.
- [ ] Commit — `feat(mobile): seller returns, disputes and the standing card`

## Wave 12 — mobile registrations

### Task 30: Mobile — registrations, deep links, parity (sole owner of `app/_layout.tsx`)

**Files:** modify `packages/mobile/app/_layout.tsx` (the nine new screens), `src/lib/deepLinks.ts` (`CASE_DEEP_LINKS`: `/disputes/{id}`, `/returns/{id}`, `/seller/returns/{id}`, `/seller/disputes` — beside `PAYMENT_DEEP_LINKS`, same shape), extend `src/lib/routeRegistration.test.ts` and the deep-link tests (Task 20's push data resolves to screens, run against the real `notificationUrl`); regenerate `.expo/types/router.d.ts` before type-checking (the AGENTS.md rule — no `as never` around `router.push`).
- [ ] Mutation: delete one registration → the proof test names the file.
- [ ] Commit — `feat(mobile): the case routes, reachable and provably so`

## Wave 13 — release

### Task 31: Staging pass and the release record

Mostly the user's. **The buildable half:** extend `packages/api/tests/int/staging-rehearsal.int.spec.ts` (the P5 release idiom) with the two Task 22 traces run against the fake provider with `disputes.enabled` forced on via seeded G2/G3 gate rows + `PROTECTED_PAYMENT_ALLOWED=true`, plus every `cases` job run across a simulated 40-day clock twice (idempotency at scale), plus one night of `reconcileLedger` after a dispute refund (the P5 nights stay green with P6's postings in the ledger). Write `docs/superpowers/releases/2026-10-04-p6-release-record.md` carrying:
- the production sequencing the spec dictates: **returns on from deploy** (legal obligation, no flag); **disputes off** until the user files G2 and G3 evidence rows (then on for Douala and Yaoundé); strike effects and any `sellerLossFee` off until G4;
- the deploy-time obligations: `syncNotificationWorkflows` against Novu (the 14 workflows), `migrate` (the Task 6 fields), the still-owed P4 items (the memory note's list);
- the question list to send: L1–L10 and N15, verbatim from the spec's tail — the user sends them; no task waits on an answer;
- the weekly review metrics: dispute volume, median time to resolution, overdue refunds, alongside the D4 go/no-go set;
- the manual client pass checklist (the spec's five scenarios) for the user to run on staging with the NotchPay sandbox where P5's adapter work has landed, on the fake otherwise;
- the four ceilings re-measured on the quiet tree at close, republished only at-or-below 105/86/78/35.
- [ ] Commit — `docs: the P6 release record and the staging rehearsal`

## Spec coverage

Every spec section maps to a task: Gates → 2, 31 (G5 is P5's flag; G6 is P8's — the seam is 5); Legal bases table → 3, 4, 9; Data model: return-cases → 6, 9–11; disputes → 6, 15–18; dispute-messages → 6, 15, 18; dispute-evidence (+views) → 6, 14; shop-strikes → 6, 8; risk-signal-outbox → 6, 8; collection changes → 6; Reasons/windows/silence → 4, 15, 17; State machines → 9, 15 (tables), 10, 17 (motion); Burden of proof → 4, 18, 19; Returns routes → 9, 10, 11; Disputes routes → 14, 15, 17; Moderator arbitration → 16, 18; Money effects: breakdown → 3; COD table → 11, 12, 16; protected table → 11, 16 (+ P5 landed); resale → 5, 16; Stock → 10, 16 (counterfeit); Reviews → 6, 15, 16; Risk signals → 8 (+ call sites 9, 11, 14–16); Jobs → 10, 14, 16, 17, 19, 21; Notifications → 20; Feature flag → 2; Error codes → 1; Web → 23–26; Mobile → 27–30; i18n → 7 (+ each client task); Testing section's named cases are distributed into the owning tasks' Step 1 lists; Verification targets → 22, 31. **Deliberately deferred with its owner named:** the P7 `returnShipment` relationship, promised-by windows and POD checklist rows (P7 flips data, not code — Tasks 4, 6, 9 note the slots); the P8 real adjuster and purchase-order typing (Task 5's registry); P5-L4's platform-advance path (Task 11's switch carries the interim behaviour the spec dictates).

## Conflicts found while planning

1. **The spec's buyer routes say `/orders/[id]`; both landed clients use `/purchases/[id]`** (web `app/purchases/[id]`, mobile `app/purchases/[id]`). The plan uses the landed client paths; API routes keep the spec's `/api/orders/{id}/…` namespace, which is also landed.
2. **`submitDisputeRefunds` is not built.** P5's landed `requestRefund` already creates the row in-transaction and queues `submitRefund` after commit, idempotent per source — exactly what the spec's job row describes. The spec predates P5's landed shape; Tasks 11/16 call `requestRefund` and Task 21 registers nothing for it.
3. **`returnShipment` (relationship to P7 shipments) cannot exist** — the collection doesn't. `returnTracking` (text) ships now; the relationship is P7's one-field migration, recorded in its hand-off.
4. **P4 spec l.523 vs l.564 (the P5 amendment list's l.527/l.564 item):** the seller-cancel route is `accepted`-only at l.523 while the transition table's l.564 lets the seller leave `paid` by decline. P5's D-6 landed the l.564 reading (shop `decline` from `paid`; the `seller-cancel` route untouched). P6 **adopts that resolution**: `openUnavailableCase` (Task 9) hooks the `order.cancelled` event and keys on the canceller's side, so it is downstream of whichever cancel paths exist and bakes in neither reading. No P6 flow adds a transition out of `paid`.
5. **A fourth ModerationLog action.** The spec's list gains `dispute.resolve`, `dispute.request_info`, `strike.revoke` — but its redaction rule ("the original stays in the moderation log metadata") requires a log row none of the three can carry. Task 6 adds `dispute.redact_message`; flagged for the spec-amendment list.
6. **Certificate storage:** the spec says "upload, private" without a collection. It lands as a `dispute-evidence` row (`kind: "document"`, `uploadedByType: "system"`, excluded from the party limits), reusing the signed-URL, view-log and purge machinery instead of an eighth collection. `purgeCaseEvidence` keeps certificates (`purgeAfter` applies to party evidence; the decision itself is retained — Task 14 sets `purgeAfter` only on party uploads).
7. **`executeRefund` and the COD proof routes live in `services/returnRefunds.ts`**, not `returns.ts` — the same file-contention reasoning that gave P5 `checkoutPayment.ts`; `returns.ts` re-exports the spec's names.
8. **P4's contest-delivery converts.** Its spec said the `reports` row stands "until P6 turns it into a dispute": with `disputes.enabled` it now opens a buyer `not_received` dispute (the reason's lower window bound waived for this path — the declaration itself raises the question); disabled, P4 behaviour is unchanged. Flagged for the amendment list since the P6 spec never restates it.
9. **`late_delivery` and `seller_no_show` fail closed until P7** (the spec's own pre-P7 reading: both windows are defined off P7 fields). The branches are written against optionally-read fields and tested with seeded data, so P7 enables them by writing data.
10. **`order-withdrawal-requested` stays declared in Novu** (ids are additive); its shop audience stops firing in favour of `return-requested` (the spec's "replaces … for the shop once P6 ships"); the buyer confirmation it carried is superseded by `return-instructions`.
11. **The spec's "`cases` queue autoRun every 5 minutes" and per-job schedules coexist** as they did in P5: autoRun drains the queue, the cron rows enqueue the sweeps; Task 21 owns both and its test pins the rows.
