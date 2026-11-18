# P6 Disputes and Returns Design

Date: 2026-09-15
Parent: `2026-09-15-business-layer-design.md`
Depends on: `2026-09-15-p1-shops-design.md`, P2 (private storage, verified identity), P4 (COD orders, withdrawal request, handover OTP, commission invoices), `2026-09-15-p5-protected-payment-design.md` (refunds, payout holds, ledger). Reads P7 proof of delivery and P8 resale roles when those phases have shipped.

## Gates

| # | Gate | Owner | Blocking for | Until cleared |
|---|---|---|---|---|
| G1 | Lawyer confirms the withdrawal rules: period (15 days under Law 2010/021 art. 20 or 14 under Law 2011/012), start point, return shipment deadline, whether the outbound delivery fee is refunded, and whether any category is legally excluded. | Product owner | Nothing | The defaults below take the most buyer-favourable reading: 15 days from delivery, outbound delivery refunded on a full return, no excluded category. An answer can only relax a setting, never force a migration. |
| G2 | Lawyer approves the dispute terms: BuyNSellem's decisions are contractual and not binding arbitration; both parties keep their court and consumer-association recourse (Law 2011/012 art. 5 voids liability-limiting clauses); the seller carries the burden of proof (Law 2010/021 art. 26); the evidence and silence rules below. | Product owner | Enabling `disputes.enabled` | Disputes intake stays off; buyers are routed to `/contact`. Returns still run, because the withdrawal right is a legal obligation. |
| G3 | Data-protection authorisation (P2 gate) extended to dispute evidence: photos and videos that may show people, homes and addresses; retention period. | Product owner | Evidence uploads, hence disputes | Same as G2. |
| G4 | Lawyer approves strikes, capability restrictions and any monetary dispute fee in the seller terms. | Product owner | Strike effects; `disputes.sellerLossFee > 0` | Strikes are recorded and shown, capability effects stay off, and the fee stays 0. |
| G5 | P5 gates. Protected-payment outcomes need P5's flag on. | — | Protected-payment effects | COD outcomes ship alone. Protected orders cannot exist while P5 is off. |
| G6 | D3 resale terms written and signed by suppliers and resellers (supplier liable for defects, reseller absorbs COD refusal delivery cost). | Product owner | Resale dispute routing | Resale orders cannot exist before P8. |

The exact questions to send are listed at the end of this document.

## Goal

Give buyers an enforceable, visible path when an order goes wrong, and give sellers a fair process with their evidence heard. The flows implement the withdrawal right, full refunds for non-conformity and late delivery, refunds for unavailable items, the seller's burden of proof, and moderator arbitration. BuyNSellem never holds or pays out buyer money. On COD orders the seller refunds the buyer directly under platform supervision. On protected-payment orders the refund goes through the provider (P5).

## Scope

1. `return-cases`: withdrawal (art. 20), non-conformity and late delivery (art. 21), unavailable item (art. 25). Physical return, inspection and refund mechanics.
2. `disputes` with reasons, statuses, deadlines, proposals, auto-escalation and a message thread.
3. Private `dispute-evidence` on P2's private storage, plus system evidence assembled from order records.
4. Seller burden of proof applied as explicit presumption rules.
5. Moderator arbitration through `services/moderation.ts` (`dispute.resolve`, `dispute.request_info`).
6. Money effects for COD orders (seller-side refund with proof, commission credit notes, strikes) and protected-payment orders (provider refund, ledger reversal through P5, payout hold and clawback).
7. Resale routing of liability (supplier vs reseller), active once P8 ships.
8. Effects on stock (return movements), reviews and risk signals (outbox for P9).
9. Notifications, error codes, web and mobile screens for buyers, sellers and moderators.

## Out of scope

- Replacement or repair as an outcome. Parties may agree to one in the thread; the platform records the dispute as `withdrawn` or `resolved_seller` with reason `agreement`.
- Claims against couriers (P7 records courier liability; recovering money from a courier is operational).
- Chargebacks: mobile money has none.
- Risk scoring, velocity limits and shop dispute-rate display (P9 consumes the signals).
- Purchase-order mechanics and affiliate commission ledger (P8). P6 calls P8's adjustment function.
- Automated image forensics.
- Legal proceedings. P6 produces a decision certificate the buyer can use.
- Multi-shop orders (P10).

## Current state (verified 2026-09-15)

- `packages/api/src/collections/Reports.ts`: `targetType` `listing|user|message` (P1 adds `shop`), reasons `spam|inappropriate|fraud|prohibited|harassment|other`, statuses `pending|reviewed|resolved`. No thread, no evidence, no deadline.
- `packages/api/src/services/moderation.ts`:
  - every action goes through `assertModerator`, `canActOn` rank checks, `ModerationError(code, status)` and `writeLog` into `moderation-log` with `MODERATION_CONTEXT`;
  - writes are sequential without a transaction (the `suspendUser` comment explains the chosen order).
- `packages/api/src/collections/ModerationLog.ts`: append-only; actions `listing.approve|reject|takedown`, `user.suspend|unsuspend`, `report.resolve|dismiss`; target types `listing|user|report`; `metadata` json.
- Mobile moderation screens: `app/moderation/index.tsx`, `listing/[id].tsx`, `report/[id].tsx`, `user/[id].tsx`. The web app has no moderation routes (`packages/web/src/app` has none).
- `packages/api/src/plugins/storage.ts` applies storage adapters to `media` only, and `Media` has `read: () => true`. No private storage exists; P2 introduces it.
- `packages/api/src/collections/Reviews.ts`: `read` public, `create` authenticated, `update`/`delete` admin only; fields `reviewer`, `reviewedUser`, `listing`, `rating`, `comment`; `afterChange` calls `updateUserRating` (`hooks/reviews.ts`). No order link or status (P0 adds reviewer rules; P4 adds verified purchases).
- `Conversations` (`participants`, `listing`, `lastMessage`) and `Messages` (`conversation`, `sender`, `content`, `listing`, `read`) serve buyer–seller chat through `packages/chat-service`. They are not built for evidence, deadlines or staff-only visibility.
- `packages/api/src/lib/errors.ts`: no order, return or dispute codes.
- `orders`, `order-events`, `commission-invoices` (P4), `stock-movements` (P1, type `return` defined), `refunds` and `payout-holds` (P5) exist only as specs.

## Design

### Legal bases and how each is handled

| Basis | Text | Opened by | Window | Return required | Return shipping paid by | Refund scope | Refund deadline |
|---|---|---|---|---|---|---|---|
| `withdrawal` | Law 2010/021 art. 20 | buyer (P4 withdrawal request) | 15 days from `deliveredAt` | yes | buyer | goods returned; outbound delivery fee when every item of the order is returned (`returns.refundOutboundDeliveryOnWithdrawal`) | 15 days from return receipt |
| `non_conformity` | art. 21 | created by a dispute outcome or seller agreement | per dispute reason | yes, unless waived (goods ≤ `returns.returnWaiverMaxGoodsValue`, default 10,000 XAF, or counterfeit) | seller | full: goods, delivery, return shipping (reimbursed up to `returns.maxReturnShippingReimbursement`, 5,000 XAF), buyer protection fee | 15 days from return receipt, or from the decision when the return is waived |
| `late_delivery` | art. 21 | buyer | from P7's `orders.delivery.promisedBy + returns.lateDeliveryGraceDays` (7) until delivery; unavailable on orders without `promisedBy` (before P7) | only if already shipped: the buyer refuses the parcel and it goes back at the seller's cost | seller | full | 15 days from the cancellation request |
| `unavailable` | art. 25 | system, when the seller cancels a confirmed or paid order in P4 | — | no | — | full (protected), executed by P5's `order.cancelled` refund, which the case references instead of issuing a second one; nothing was paid on COD | immediate for protected |

- The withdrawal right needs no reason.
- `categories` gains `withdrawalExcluded` (checkbox, admin only). A `beforeChange` hook refuses `true` until a G1 row lists the legal exception.
- On withdrawal the seller may claim a deduction only for depreciation beyond what inspecting the item requires, with evidence. A contested deduction becomes a seller-opened `damaged` dispute.

Disputes are the single intake for complaints (non-conformity, non-receipt, counterfeit, no-show, refusal abuse). Return cases are the single mechanism that moves items back and settles refunds, whatever created them.

### Data model

#### `return-cases`

| Field | Type | Rules |
|---|---|---|
| `number` | text, unique | `RET-2609-000012`, from P4's `nextNumber("RET", …)` (P4 creates the collection) |
| `order` | relationship orders, required, indexed | |
| `shop` | relationship shops, required, indexed | seller of record (the supplier in resale) |
| `buyer` | relationship users, required | |
| `basis` | select `withdrawal`, `non_conformity`, `late_delivery`, `unavailable` | |
| `items` | array | `orderItem`, `variant`, `quantity` (≤ ordered − already returned), `unitPrice`, `buyerCondition` (`unopened|opened|used|damaged`), `inspection` group: `outcome` (`restock|damaged_by_buyer|damaged_in_transit|not_matching|missing`), `deductionAmount`, `note` |
| `reasonText` | textarea | optional for `withdrawal`, up to 1,000 characters |
| `openedByType` / `openedBy` | select `buyer|seller|system` / relationship users | |
| `dispute` | relationship disputes | the dispute that created or escalated the case |
| `returnRequired` | checkbox | |
| `returnMethod` | select `buyer_drop_off`, `courier`, `seller_pickup` | `courier` creates a P7 return shipment |
| `returnShipment` | relationship shipments (P7) | |
| `returnTracking` | text | free text when no P7 shipment |
| `status` | select, see state machine | service-written |
| `statusHistory` | array | `{ status, actorType, actor, at, note }` |
| `deadlines` | group | `requestDeadline`, `shipBy`, `pickupBy`, `inspectBy`, `refundBy` |
| `shippedAt` / `receivedAt` / `inspectedAt` / `closedAt` | date | |
| `refund` | group | `amount`, `breakdown` (`goods`, `outboundDelivery`, `returnShipping`, `buyerProtectionFee`, `deduction`), `channel` (`provider|seller_direct`), `providerRefund` (relationship P5 `refunds`), `sellerProof` group (`method` `cash|mtn_momo|orange_money`, `transactionId`, `amount`, `evidence` relationship dispute-evidence, `submittedAt`), `buyerConfirmedAt`, `contestedAt` |
| `creditNote` | relationship commission-invoices | |

Access: read by the buyer, active members of the shop and moderators; writes service-only.

State machine (one transition table in `services/returns.ts`):

- `requested → approved | rejected | cancelled`
- `approved → awaiting_shipment` (return required) `| refund_pending` (no return)
- `awaiting_shipment → in_transit | expired | cancelled`
- `in_transit → received`
- `received → inspected`
- `inspected → refund_pending | disputed`
- `refund_pending → refunded | disputed`
- `refunded → closed`
- `disputed → closed` (when the linked dispute resolves; the resolution creates any follow-up case)
- Terminal: `closed`, `rejected`, `expired`, `cancelled`.

Rules:
- `requested → approved` is automatic when eligibility holds.
- `rejected` is automatic and only for ineligibility (window closed, items not delivered, quantities already returned), with the reason shown. The buyer can open a dispute against a rejection.
- `expired`: the buyer did not ship by `shipBy`; the order resumes its P4 course.
- `refunded → closed`: for protected payments when the P5 refund `succeeded`; for COD when the buyer confirms, or after `returns.codRefundConfirmSilenceDays` (7) of silence with a seller proof carrying a transaction id or cash receipt photo.

#### `disputes`

| Field | Type | Rules |
|---|---|---|
| `number` | text, unique | `DSP-2609-000007`, from P4's `nextNumber("DSP", …)` |
| `order` | relationship orders, required, indexed | |
| `shop` | relationship shops, required, indexed | the shop the buyer bought from (the reseller in resale) |
| `buyer` | relationship users, required | |
| `subject` | select `goods`, `refund` | `refund` is a contested COD refund proof; its only reason is `not_received` |
| `items` | array `{ orderItem, quantity }` | at least one |
| `returnCase` | relationship return-cases | when opened against a return case |
| `reason` | select `not_received`, `not_as_described`, `damaged`, `counterfeit`, `wrong_item`, `seller_no_show`, `cod_refused_abuse` | allowed per opener, see Reasons |
| `openedByType` / `openedBy` | select `buyer|seller|system` / relationship users | `system` for escalations created by jobs |
| `description` | textarea, required | 20–2,000 characters |
| `requestedOutcome` | select `full_refund`, `partial_refund`, `return_and_refund`, `no_refund` | `no_refund` for seller-opened disputes |
| `requestedAmount` | number | required for `partial_refund` |
| `paymentMethod` | select `cod`, `mobile_money` | snapshot of the order; `mobile_money` is the protected payment |
| `amountAtStake` | number | refundable ceiling at opening |
| `status` | select `open`, `awaiting_seller`, `awaiting_buyer`, `under_review`, `resolved_buyer`, `resolved_seller`, `resolved_split`, `withdrawn` | service-written |
| `statusHistory` | array | `{ status, actorType, actor, at, note }` |
| `deadlines` | group | `submitBy`, `respondBy`, `reviewDueAt` |
| `proposal` | group | `amount`, `returnRequired`, `byType`, `by`, `at`, `expiresAt`, `round` (1–3), `status` `open|accepted|rejected|lapsed` |
| `infoRequests` | number | max `disputes.maxInfoRequests` (2) |
| `assignedTo` | relationship users | moderator |
| `resolution` | group | `outcome`, `refundAmount`, `breakdown`, `returnRequired`, `returnShippingPaidBy` (`seller|buyer`), `liableParty` (`seller|supplier|reseller|courier|buyer|none`), `reasonCode`, `publicStatement` (FR and EN), `decidedByType` (`system|agreement|moderator`), `decidedBy`, `decidedAt` |
| `effects` | group | `returnCase`, `refund` (P5), `creditNote`, `holdsReleased`, `strikes`, `riskSignals`, `reviewAction` (`none|published|removed`), `certificate` (upload, private) |
| `resale` | group | `supplierShop`, `resellerShop`, `purchaseOrder` (filled by P8) |

- Access: read by the buyer, active members of `shop` (and of `resale.supplierShop`) and moderators. Writes service-only.
- A partial unique index on `order` where `status` is not terminal enforces one active dispute per order.

`reasonCode` values: `seller_no_proof`, `delivery_proven`, `item_conforms`, `item_not_conforming`, `counterfeit_confirmed`, `counterfeit_not_established`, `damage_in_transit`, `buyer_damage`, `buyer_abuse`, `review_extortion`, `partial_fault`, `agreement`, `other`.

#### `dispute-messages`

Append-only. `create` goes through the route; `update` and `delete` are closed except the staff redaction below.

| Field | Type | Rules |
|---|---|---|
| `dispute` | relationship, required, indexed | |
| `authorType` / `author` | select `buyer|seller|supplier|moderator|system` / relationship users | |
| `kind` | select `message`, `proposal`, `proposal_response`, `info_request`, `decision`, `system` | |
| `body` | textarea | up to 2,000 characters |
| `evidence` | relationship dispute-evidence, hasMany | up to 5 per message |
| `visibility` | select `parties`, `staff` | parties never read `staff` rows |
| `redactedAt` / `redactedBy` | date / relationship | a moderator can replace an abusive body with "Message removed by moderation"; the original stays in the moderation log metadata |

#### `dispute-evidence`

A private upload collection on P2's private storage adapter. It is never added to the public `media` storage config.

| Field | Type | Rules |
|---|---|---|
| `dispute` / `returnCase` | relationships | one required |
| `uploadedByType` / `uploadedBy` | select / relationship users | |
| `kind` | select `photo`, `video`, `document`, `payment_proof`, `shipping_proof` | |
| `mimeType` / `size` | text / number | images `jpeg|png|webp|heic` ≤ 10 MB; video `mp4|mov` ≤ 50 MB and ≤ 60 s; `pdf` ≤ 10 MB |
| `sha256` | text, indexed | computed on upload |
| `capturedAt` | date | from EXIF before stripping, when present |
| `exifStripped` | checkbox | GPS and device EXIF removed server-side before storage |
| `visibility` | select `parties`, `staff` | a moderator can restrict a file showing third-party personal data |
| `purgeAfter` | date | resolution + `disputes.evidenceRetentionDays` (1,095 by default, pending G3) |

- Limits: 10 files per party per dispute, 30 in total (`dispute.evidenceLimit`).
- File bytes are served only through `GET /api/disputes/{id}/evidence/{evidenceId}/url`, which returns a signed URL valid 5 minutes (P2's `createSignedDocumentUrl`) to parties (for `parties` visibility) and moderators. Every issuance is recorded in `dispute-evidence-views` (append-only, same fields as P2's `verification-document-views` with `evidence` and `dispute` in place of `document` and `request`, admin read, 3-year retention).

**System evidence** is not uploaded. `services/disputes.ts#systemEvidence(order)` assembles it from records at read time:
- the order snapshot at placement (item titles, descriptions, options, photos, price; P4);
- the `order-events` timeline;
- the handover OTP verification record (time, verifying user, device, coordinates when captured; P4);
- P7 proof of delivery (photo, GPS, time, courier) and delivery attempts;
- payment, refund and payout status (P5);
- the order conversation.

Parties see the timeline, their own OTP and POD records, and payment status. Moderators see everything.

#### `shop-strikes`

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, required, indexed | |
| `kind` | select `dispute_lost`, `refund_overdue`, `counterfeit_confirmed`, `no_response`, `unavailable_after_confirmation`, `review_extortion` | |
| `weight` | number | `1` for `no_response`, `unavailable_after_confirmation`, `dispute_lost`; `2` for `refund_overdue`, `review_extortion`; `3` for `counterfeit_confirmed` |
| `sourceType` / `sourceId` | select `dispute|return-case` / text | |
| `status` | select `active`, `expired`, `revoked` | |
| `expiresAt` | date | creation + 180 days |
| `revokedBy` / `note` | | admin only, through `strike.revoke` |

Read by active shop members and moderators; writes service-only.

`services/strikes.ts#shopStanding(shopId)` returns `{ activeWeight, restrictions }`. It is read by P4 caps and P5 eligibility once G4 clears:
- `activeWeight ≥ 3`: COD daily cap and protected exposure cap halved;
- `activeWeight ≥ 5`: protected payment unavailable for new orders, and the shop is queued for moderation review with a suggested `shop.suspend`.

#### `risk-signal-outbox`

Append-only, staff read, written only by `services/riskSignals.ts#recordRiskSignal`. P9 consumes rows into `risk-flags` and sets `consumedAt`. P6 never reads P9 collections.

| Field | Type |
|---|---|
| `subjectType` / `subjectId` | select `shop|user|phone` / text |
| `signal` | select, see Risk signals |
| `severity` | select `low`, `medium`, `high` |
| `sourceType` / `sourceId` | select `dispute|return-case` / text |
| `occurredAt` / `consumedAt` | date |

#### Changes to other collections

- `orders` (P4):
  - `activeDispute` (relationship, service-written); the active return case is P4's existing `returnCase` field;
  - while either is set, P6 keeps P4's `completionHold` at `dispute` or `return_case`, and sets it back to `none` when both are cleared, so P4's `completed` guard blocks completion;
  - P6 moves the order to `disputed` (from `shipped` or `delivered`; a `completed` order keeps its status) or `returned` through P4's transition service.
- `commission-invoices` (P4): `kind` (`invoice|credit_note`), `creditsInvoice`, `sourceType`/`sourceId`. Credit notes use series `A` (`BNS-A-{year}-{sequence}`, P4's `nextInvoiceNumber("A", …)`), bilingual, VAT at the invoice's rate.
- `reviews` (P0/P4): new `status` select `published`, `held_dispute`, `removed` (default `published`, service-written); only `published` reviews are public and counted in ratings.
- `ModerationLog`: actions gain `dispute.resolve`, `dispute.request_info`, `strike.revoke`; `targetType` gains `dispute`.
- `categories`: `withdrawalExcluded`.
- `AppSettings`: `returns` and `disputes` groups (see Feature flag).

### Reasons, windows and silence defaults

| Reason | Opened by | Window | Evidence required from opener | If the counterparty is silent by `respondBy` |
|---|---|---|---|---|
| `not_received` | buyer | from P7's `delivery.promisedBy + 2 days` (or `shippedAt + 7 days` without a promise) to `placedAt + disputes.notReceivedMaxDays` (60). For COD, only when the order is marked `delivered` or `cod_collected`. | none | no delivery proof (no verified OTP, no P7 POD) → `resolved_buyer` by system; proof present → `under_review` |
| `not_as_described` | buyer | 15 days from `deliveredAt` | ≥ 1 photo or video | `resolved_buyer`, return required unless waived |
| `damaged` | buyer; or seller on a return case | buyer: 15 days from `deliveredAt`; seller: `inspectBy` of the case | ≥ 1 photo | opener wins: buyer-opened → `resolved_buyer` with return; seller-opened → `resolved_seller` (deduction applied) |
| `counterfeit` | buyer | 60 days from `deliveredAt` | ≥ 2 photos (item and marking) | always `under_review`, never decided by silence |
| `wrong_item` | buyer; or seller on a return case | buyer: 15 days from `deliveredAt`; seller: `inspectBy` | ≥ 1 photo of item and label | opener wins |
| `seller_no_show` | buyer | 7 days after the scheduled delivery slot (P7 `redelivery.scheduledFor` and `window`) or the end of the P7 pickup hold | none | `resolved_buyer` |
| `cod_refused_abuse` | seller | 7 days after a P4 refusal event on a COD order | delivery-attempt proof (P7 attempt with GPS, or call log photo) | `resolved_seller` |

For protected orders, every window also ends at `paidAt + 80 days`, keeping refunds inside the provider's 90-day limit (P5).

Other conditions:
- Opening requires the caller to be the buyer, or an active `owner` or `manager` of the seller-of-record shop for seller reasons.
- The order must not already have an active dispute (`dispute.alreadyOpen`).
- The items must not be in an active return case unless the dispute references it (`dispute.returnCaseActive`).

### Dispute state machine and deadlines

Transition table in `services/disputes.ts`:

- `open → awaiting_seller | awaiting_buyer | withdrawn`
  - on submit by the opener, or automatically at `submitBy = createdAt + 24 h`;
  - buyer-opened goes to `awaiting_seller`, seller-opened to `awaiting_buyer`.
- `awaiting_seller → resolved_buyer | awaiting_buyer | under_review | withdrawn`
- `awaiting_buyer → resolved_seller | resolved_split | awaiting_seller | under_review | withdrawn`
- `under_review → awaiting_seller | awaiting_buyer | resolved_buyer | resolved_seller | resolved_split`
- `resolved_*` and `withdrawn` are terminal.

Actions:
- **Respond** (counterparty, in `awaiting_*`):
  - `accept`: full refund → `resolved_buyer` by agreement, or for a seller-opened dispute, no refund → `resolved_seller` by agreement;
  - `propose`: amount and `returnRequired` → the other side's `awaiting_*`, `proposal.round + 1`, expiring in 72 h;
  - `contest`, with a message and at least one evidence file or system evidence reference → `under_review`.
- **Proposal response:** `accept` → `resolved_split` (or `resolved_buyer` when the amount equals the full refundable amount) by agreement; `reject` → `under_review`. A lapsed proposal → `under_review`. After `disputes.maxProposalRounds` (3) rounds → `under_review`.
- **Escalate:** either party, from `awaiting_*`, after at least one exchange → `under_review`.
- **Withdraw:** opener only, before a resolution. A withdrawn dispute cannot be reopened for the same reason and items.
- **Request info:** moderator, from `under_review` → `awaiting_seller` or `awaiting_buyer` with a 72-hour deadline. Silence returns the dispute to `under_review` with the evidence at hand; it never decides by default.

Deadlines, from `AppSettings.disputes`:
- `respondBy` = transition time + 72 h, with a reminder at 48 h. Silence applies the default from the reasons table.
- `reviewDueAt` = entry into `under_review` + 5 business days (Monday–Friday, Africa/Douala). Breach alerts admins.
- A dispute not resolved 30 days after opening, or a protected order reaching `paidAt + 80 days`, raises a priority admin alert.

### Seller burden of proof (Law 2010/021 art. 26)

`services/disputes.ts#proofChecklist(dispute)` computes, per reason, what the seller has established. The moderator workspace shows it; the silence defaults use it.

| Reason | Seller proof that establishes the seller's position |
|---|---|
| `not_received` | handover OTP verified by the buyer's code (P4), or P7 POD with photo and GPS within 200 m of the delivery pin |
| `seller_no_show` | P7 attempt at the slot, or a message in the order conversation rescheduling before the slot and accepted by the buyer |
| `not_as_described`, `wrong_item` | order snapshot matching the received item's photos, plus pre-shipment photos or a packing record uploaded before `shippedAt` |
| `damaged` (buyer) | pre-shipment photos and a POD photo showing the parcel intact; damage in transit is then attributed to `courier` |
| `counterfeit` | invoice or authorisation from the brand or an authorised distributor |

Decision guidelines, enforced in `resolveDispute`:
- A `resolved_seller` outcome when the checklist shows no seller proof for a buyer-opened dispute requires `reasonCode` `buyer_abuse`, `item_conforms` or `delivery_proven` and an internal note of at least 50 characters.
- The decision certificate always states which proof was relied on.
- For `cod_refused_abuse` the seller is the opener and carries the proof of the delivery attempt.

### Services and routes

New services: `services/returns.ts`, `services/disputes.ts`, `services/disputeEvidence.ts`, `services/strikes.ts`, `services/riskSignals.ts`. Multi-document writes use a Payload transaction. Provider calls (P5 refunds) are queued jobs keyed by idempotency key, run after commit.

#### Returns

- **`POST /api/orders/{id}/returns`** (buyer). Body: `basis` (`withdrawal|late_delivery`), `items`, optional `reasonText`, `returnMethod`. P4's withdrawal request calls `services/returns.ts#openWithdrawal` with the same checks.
  - Withdrawal: order `delivered` or `completed`; now ≤ `requestDeadline`; items delivered; quantities available; no item of a `withdrawalExcluded` category.
  - Late delivery: order not `delivered`; now ≥ `delivery.promisedBy + lateDeliveryGraceDays`.
  - In one transaction:
    - create the case `approved`;
    - set `deadlines` (`shipBy = approvedAt + 15 days` for withdrawal);
    - set `orders.returnCase`, `completionHold: return_case` and append `order-events` `return.requested`;
    - for protected orders, create the P5 order hold `return_open`.
  - Late delivery with nothing shipped goes straight to `refund_pending`, and P4 cancels the shipment.
- **`GET /api/returns/{id}`** (parties, moderators).
- **`POST /api/returns/{id}/ship`** (buyer). `returnMethod`, `returnTracking` or a P7 return shipment, optional `shipping_proof` evidence → `in_transit`. For a P7 courier return, the shipment is billed to the buyer (withdrawal) or to the seller (`non_conformity`).
- **`POST /api/returns/{id}/receive`** (shop `owner`, `manager` or `staff`) → `received`, `inspectBy = receivedAt + 3 days`, `refundBy = receivedAt + 15 days`.
- **`POST /api/returns/{id}/inspect`** (shop member). Per item `outcome`, optional `deductionAmount` (requires evidence, ≤ item price, not allowed for `non_conformity`).
  - No deduction → `inspected → refund_pending`, then refund execution.
  - With a deduction:
    - the undeducted amount is refunded at once;
    - the buyer has 72 h to accept (`POST /api/returns/{id}/deduction` `accept|contest`);
    - contest or silence opens a seller-opened `damaged` dispute (`openedByType: system`) straight in `under_review`, and the case → `disputed`.
- **`POST /api/returns/{id}/pickup`** (seller, `seller_pickup`): records the pickup → `in_transit`.
- **`POST /api/returns/{id}/refund-proof`** (shop `owner` or `manager`, COD only): `method`, `transactionId` (required for mobile money), `amount` (≥ the case refund amount), evidence.
- **`POST /api/returns/{id}/confirm-refund`** (buyer) → `refunded → closed`.
- **`POST /api/returns/{id}/contest-refund`** (buyer) opens a dispute with `subject: refund`, `reason: not_received`, straight in `awaiting_seller`.
- **`POST /api/returns/{id}/cancel`** (buyer, before `in_transit`).
- **`GET /api/shops/{id}/returns?status=&overdue=`** (shop members), **`GET /api/me/returns`** (buyer).

Presumptions, applied by `advanceReturnCases`:
- **Not received back:** buyer shipping proof or P7 return delivered, and no `receive` within 7 days → `received` with `actorType: system`.
- **No inspection:** at `inspectBy` → every item `restock`, full refund.
- **Pickup missed:** `seller_pickup` not done by `pickupBy` (5 days) → the return is waived and the refund proceeds.

Refund execution (`services/returns.ts#executeRefund`):
- **Protected:** P5 `requestRefund` with the case breakdown, reason `withdrawal`, `unavailable` or `dispute`, `sourceType: return-case`, idempotency key `return-case:{id}:1`.
  - P5 `refund.windowExpired` switches the case to `channel: seller_direct` and the COD path, until lawyer question P5-L4 enables P5's advance path.
  - On P5 `succeeded`, the case → `refunded → closed`, and the P5 hold is released.
- **COD:** `channel: seller_direct`. The seller must refund and submit proof by `refundBy`.
  - At `refundBy` without proof: strike `refund_overdue`, risk signal `refund_overdue`, moderation queue item, reminder every 3 days.
  - At `refundBy + 30 days`: the moderation item is upgraded with a suggested `shop.suspend`.
- **Commission (COD):** if the order's commission invoice exists, a credit note is issued at `closed` (see Money effects).

#### Disputes

- **`POST /api/orders/{id}/disputes`**. Body: `reason`, `items`, `description`, `requestedOutcome`, `requestedAmount`, optional `returnCaseId`, `subject`. Applies Reasons and eligibility, then in one transaction:
  - create the dispute `open`, `submitBy = now + 24 h`;
  - set `orders.activeDispute` and `completionHold: dispute`, move a `shipped` or `delivered` order to `disputed` through P4 and append `order-events` `dispute.opened`;
  - for a protected order, create the P5 order hold `dispute_open`;
  - hold any `published` review of this order by the buyer as `held_dispute`.
- **`POST /api/disputes/{id}/evidence`** (multipart, party), **`GET /api/disputes/{id}/evidence/{evidenceId}/url`**.
- **`POST /api/disputes/{id}/submit`** (opener): requires the reason's evidence (`dispute.evidenceRequired`).
- **`POST /api/disputes/{id}/messages`** (party): body and evidence; not allowed in terminal states.
- **`POST /api/disputes/{id}/respond`** (counterparty): `action` `accept|propose|contest`, `amount`, `returnRequired`, `message`, `evidenceIds`.
- **`POST /api/disputes/{id}/proposal`** (party receiving it): `accept|reject`.
- **`POST /api/disputes/{id}/escalate`**, **`POST /api/disputes/{id}/withdraw`**.
- **`GET /api/disputes/{id}`**: dispute, messages visible to the caller, evidence metadata, system evidence per role, deadlines, allowed actions for the caller.
- **`GET /api/me/disputes`**, **`GET /api/shops/{id}/disputes?status=`**.

Resolution by agreement (accepted refund or proposal) runs the same `applyOutcome` as a moderator decision, with `decidedByType: agreement`, and is recorded in `order-events`. It writes no moderation log entry, because no moderator acted.

#### Moderator arbitration

`services/moderation.ts` gains:

- `requestDisputeInfo(payload, actor, disputeId, { from: "buyer" | "seller", message })`: moderator; dispute `under_review`; `infoRequests < max`. Posts an `info_request` message, transitions and writes `dispute.request_info`.
- `resolveDispute(payload, actor, disputeId, input)` where `input` = `{ outcome, refundAmount, returnRequired, returnShippingPaidBy, liableParty, reasonCode, publicStatement: { fr, en }, note }`.
  - `assertModerator`. The actor must not be the buyer or an active member of any shop on the order (`moderation.forbidden`).
  - Status must be `under_review` (`moderation.invalidTransition`).
  - `resolved_buyer` requires `refundAmount > 0`; `resolved_seller` requires `refundAmount = 0`; `resolved_split` requires `0 < refundAmount < refundable`. `refundAmount ≤ refundable` (`dispute.refundExceedsOrder`), where refundable is `buyerTotal − refundedAmount` for protected orders and the paid goods plus delivery value for COD.
  - `refundAmount > disputes.moderatorRefundLimit` (250,000 XAF) requires an admin (`moderation.rankTooLow`).
  - The burden-of-proof guideline above.
  - In one transaction, `applyOutcome` runs, then `writeLog` with action `dispute.resolve`, `targetType: dispute`, `reason: reasonCode`, `note`, and metadata `{ outcome, refundAmount, breakdown, returnRequired, returnShippingPaidBy, liableParty, paymentMethod, returnCaseId, refundId, creditNoteId, strikeIds, holdIdsReleased, riskSignalIds, reviewAction, proofChecklist }`. Unlike the existing sequential moderation writes, this uses a transaction because it creates financial records.
- `revokeStrike(payload, actor, strikeId, { note })`: admin; writes `strike.revoke`.

`applyOutcome(dispute, outcome)`:
1. Computes the breakdown (see Money effects).
2. Creates a `return-cases` row `approved` with `basis: non_conformity` when `returnRequired`, or `refund_pending` when the refund needs no return. A dispute on an existing case updates that case instead.
3. Posts the `decision` message with the public statement.
4. Creates strikes and risk signals per the tables below.
5. Applies the review rule.
6. Releases the P5 `dispute_open` hold when no refund remains to execute.
7. Clears `orders.activeDispute` and hands the order back to P4: `delivered` (or `shipped` while a delivery is still under way), which P4's `completeOrders` completes once the window has elapsed and `completionHold` is `none`; `returned` after a full refund of delivered goods; `cancelled` for `not_received` resolved for the buyer on an undelivered order.
8. Renders the bilingual decision certificate PDF into private storage.

Routes:
- `GET /api/moderation/disputes?status=&reason=&paymentMethod=&overdue=&assigned=me` sorted by nearest deadline.
- `GET /api/moderation/disputes/{id}`: full sheet with system evidence, proof checklist, party history (buyer refusal score from P4, buyer's disputes in the last 12 months, shop strikes, shop dispute loss rate), resale roles.
- `POST /api/moderation/disputes/{id}` with `action: assign | request_info | resolve`.

### Money effects

#### Breakdown

For a refund of goods value `g` on items of the order:
- `goods = g − deduction`.
- `outboundDelivery` = the order delivery fee when every item is refunded and the basis is `non_conformity`, `late_delivery`, `unavailable`, or `withdrawal` with the setting on; otherwise 0.
- `returnShipping` = documented buyer cost up to the cap when `returnShippingPaidBy = seller`.
- `buyerProtectionFee` = the fee on a full refund of a protected order, 0 otherwise (P5 rule, pending P5-L3).
- A moderator's `refundAmount` on `resolved_split` is allocated to goods first, then delivery, never to the fee.

#### COD orders

BuyNSellem holds nothing and refunds nothing on COD orders.

| Outcome | Buyer | Seller | Commission | Standing |
|---|---|---|---|---|
| `resolved_buyer` | refunded by the seller directly through the return case (`seller_direct`), after return when required; deadline 15 days from receipt or decision | pays refund, outbound delivery and return shipping per breakdown | credit note on the commission invoice for the refunded share | strike `dispute_lost` (no strike when resolved by agreement before `under_review`) |
| `resolved_split` | partial refund from the seller as above | pays the agreed amount | credit note for the refunded goods share | strike only when decided by a moderator with `reasonCode` `item_not_conforming` or `seller_no_proof` |
| `resolved_seller` | nothing; certificate explains recourse | nothing | unchanged | buyer-side signal when `reasonCode` is `buyer_abuse` or `review_extortion` |
| `cod_refused_abuse` → `resolved_seller` | refusal score +2 in P4 (a plain refusal counts +1) | bears its own delivery cost; nothing can be charged to the buyer | no commission (never delivered) | signal `cod_refusal_abuse` on the buyer's phone |

- **Commission credit:** P6 writes a P4 `commission-lines` `credit` of `creditHt = roundXaf(commissionHt × refundedGoods / commissionBase)` (P4 A3: commission accrues at delivery, returns are credited).
  - Charge line not yet invoiced: the credit nets it on the same weekly invoice.
  - Charge line already invoiced (paid or not): a credit note (series `A`) documents the credit, plus VAT at the invoice rate, and the credit line is netted on the next commission invoice.
  - No invoice within 90 days, or the shop closed: BuyNSellem pays the credit from its own revenue to the shop's P4 commission payment number. This is a refund of BuyNSellem's own fee, not third-party funds.
- **Seller does not refund:** the buyer receives the decision certificate, containing:
  - the order;
  - the decision and the proof relied on;
  - the shop name, handle, RCCM and NIU when provided;
  - the statement that the buyer may take the claim to a consumer association or court.
  The shop owner's legal identity is disclosed only to a court or authority on request.
- **Monetary dispute fee:** `disputes.sellerLossFee` (default 0) adds a VAT-bearing line to the next commission invoice when a moderator decides against the seller. Enabled only after G4.

#### Protected-payment orders

| Situation | Effect |
|---|---|
| Dispute or return open before completion (normal case: P4 cannot complete the order) | P5 order hold `dispute_open` or `return_open` blocks release |
| `resolved_buyer`, full | P5 `requestRefund` for `buyerTotal − refundedAmount`, reason `dispute`. The commission comes back out of the application fee (P5 `refund_submitted` against `platform_fee_unearned`), the fee is refunded, and no commission invoice is ever issued. Hold released when the refund `succeeded`. Order → `returned`. |
| `resolved_split` | P5 partial refund. Commission is reduced pro rata; the fee is retained. Hold released after the refund `succeeded`. The order completes when the window has elapsed; the commission invoice uses the reduced base. |
| `resolved_seller` | Hold released. The order completes when the window has elapsed. |
| Refund after release (counterfeit found after completion, early release, or `provider_schedule` payouts) | P5 refund with the connected account debited first and any shortfall as `seller_receivable` recovered by P5's clawback path. The commission share is reversed against `platform_revenue_commission` and `vat_payable` by P5, and P6 issues the commission credit note. |
| Payment older than 85 days | P5 returns `refund.windowExpired`; the case switches to `seller_direct` with the COD obligations, strikes and certificate. When P5-L4 clears, P5's `platform_advance` path replaces it. |

Refunds for a dispute use idempotency key `dispute:{id}:refund`, so a retried resolution never refunds twice.

#### Resale orders (active once P8 ships)

- The buyer sees the reseller shop. `resale.supplierShop` is the seller of record and a party: supplier `owner` and `manager` members can read, respond and propose. Reseller members can read and send messages.
- Refunds always come from the seller of record: the supplier's connected account for protected orders, the supplier directly for COD.
- `liableParty` routes the loss:
  - `supplier`: defects, `not_as_described` against the supplier's product data, `damaged` before handover, `counterfeit`, `wrong_item`, `not_received` without proof. Strikes go to the supplier shop.
  - `reseller`: `not_as_described` where the reseller's listing text or options contradict the supplier's product snapshot. The supplier refunds the buyer, and P8's `adjustResellerCommission(purchaseOrder, −amount, { source: dispute })` recovers the supplier's loss from the reseller's unpaid affiliate commissions. Strike to the reseller shop.
  - `courier`: damage in transit with intact pre-shipment proof. The seller of record refunds; recovery from the courier is outside P6.
- COD refusal on a resale order: the reseller absorbs the delivery cost through `adjustResellerCommission(purchaseOrder, −deliveryCost, { source: cod_refusal })`, whether or not a `cod_refused_abuse` dispute is opened. Supplier or reseller members may open that dispute.
- Reseller commission for a disputed order stays unpaid until resolution (P8 pays after the dispute window): cancelled on a full `resolved_buyer`, reduced pro rata on `resolved_split`.
- When the buyer's verified phone matches a member of the reseller or supplier shop, the signal `resale_collusion_suspected` is recorded at opening.

### Stock

All movements go through `services/stock.ts` with `orderRef` = order id and `note` = case number. Variants with `trackInventory: false` get no movement. For resale, movements apply to the supplier's variant.

| Inspection outcome | Movements (one transaction) |
|---|---|
| `restock` | `return` +quantity |
| `damaged_by_buyer`, `damaged_in_transit`, `not_matching` | `return` +quantity, then `loss` −quantity, note "returned unsellable" |
| `missing` | none |
| return waived | none |
| `counterfeit_confirmed` decision | none; `applyOutcome` calls `takedownListing` and archives the product through the P1 product service, recorded in the log metadata |

For `unavailable` cases, P4 releases the reservation. P6 records the signal `unavailable_after_confirmation` and sets the variant's `lowStockThreshold` alert, so the seller corrects stock before selling again.

### Reviews

- A review of an order with an active dispute is stored with `status: held_dispute`. It is not published and not counted by `updateUserRating` until 24 hours after resolution. Both parties are told a review is pending.
- At resolution, held reviews are published (`effects.reviewAction: published`), except:
  - on `resolved_seller` with `reasonCode` `delivery_proven` or `buyer_abuse`, a moderator may remove a review whose content contradicts the decision (`removed`, logged in `dispute.resolve` metadata);
  - on `review_extortion` (a party conditioned a refund or a proposal on a review), the offending party's review of the order is removed and a strike (seller) or signal (buyer) is recorded.
- The buyer may replace a held review once before it is published.
- Reviews keep their verified-purchase flag, except when `cod_refused_abuse` is resolved for the seller: the buyer never took delivery, so the flag is removed.

### Risk signals

Recorded in `risk-signal-outbox` inside the transaction that causes them:

| Signal | Subject | Severity | When |
|---|---|---|---|
| `dispute_lost_seller` | shop | medium | moderator `resolved_buyer` or `resolved_split` against the seller |
| `counterfeit_confirmed` | shop | high | `reasonCode: counterfeit_confirmed` |
| `refund_overdue` | shop | high | COD refund proof missing at `refundBy` |
| `seller_no_response` | shop | low | silence default applied against the seller |
| `unavailable_after_confirmation` | shop | low | `unavailable` case |
| `dispute_abuse_buyer` | user, phone | medium | `resolved_seller` with `buyer_abuse` |
| `cod_refusal_abuse` | phone | medium | `cod_refused_abuse` resolved for the seller |
| `serial_withdrawal` | user | low | third withdrawal case in 30 days |
| `evidence_reused` | user or shop | medium | uploaded `sha256` already attached to another account's dispute |
| `review_extortion` | user or shop | medium | `reasonCode: review_extortion` |
| `resale_collusion_suspected` | shop | high | buyer phone matches a reseller or supplier member |

### Jobs

Added to `jobs.tasks`, on a new `cases` queue autoRun every 5 minutes (`*/5 * * * *`, limit 100):

| Job | Schedule | Work |
|---|---|---|
| `advanceDisputes` | every 15 min | auto-submit at `submitBy`, reminders at 48 h, silence defaults at `respondBy`, proposal lapses, `reviewDueAt` breach and 30-day and 80-day alerts |
| `advanceReturnCases` | hourly | `requestDeadline` closure, `shipBy` expiry, receipt and inspection presumptions, missed pickup, deduction silence, `refundBy` overdue handling, COD confirmation silence |
| `submitDisputeRefunds` | queued | calls P5 `requestRefund` for outcomes and cases, idempotent |
| `renderDisputeCertificate` | queued | bilingual PDF into private storage |
| `publishHeldReviews` | hourly | publishes held reviews 24 h after resolution |
| `expireStrikes` | daily 01:00 | `active` past `expiresAt` → `expired` |
| `purgeCaseEvidence` | daily 03:30 | deletes files past `purgeAfter` and keeps metadata and `sha256`; skipped for disputes flagged `legalHold` by an admin |

Every job action is idempotent against the state machines; running a job twice changes nothing.

### Notifications

New Novu workflows in `syncNotificationWorkflows.ts`, with push routes in `hooks/notificationEvents.ts`:

| Workflow | Recipient | Channels | Trigger |
|---|---|---|---|
| `return-requested` | shop owner, managers | in-app, push, email | case approved; replaces P4's `order-withdrawal-requested` for the shop once P6 ships |
| `return-instructions` | buyer | in-app, email | case approved: address or pickup, `shipBy`, who pays |
| `return-received` / `return-inspected` | buyer | in-app, push | receipt / inspection outcome, deduction if any |
| `refund-proof-submitted` | buyer | in-app, push | COD proof uploaded, confirm or contest |
| `refund-overdue` | shop owner; buyer | in-app, push, email | `refundBy` passed |
| `dispute-opened` | counterparty | in-app, push, email | submit |
| `dispute-message` | other party | in-app, push | new message or proposal (throttled to 1 per 10 min per dispute) |
| `dispute-deadline-reminder` | party expected to act | push, email | 24 h before `respondBy` |
| `dispute-info-requested` | requested party | in-app, push, email | moderator request |
| `dispute-escalated` | both parties | in-app | `under_review` |
| `dispute-resolved` | both parties (and supplier in resale) | in-app, push, email | resolution, with outcome and next steps |
| `dispute-review-overdue` | admins | email | `reviewDueAt` passed |
| `shop-strike-added` | shop owner | in-app, email | strike created, with reason and expiry |

Push data routes: disputes to `/disputes/{id}`, returns to `/returns/{id}`, seller-side notifications to the seller routes.

### Feature flag

`AppSettings` gains:

- **`returns`:** `shipByDays` 15, `nonConformityShipByDays` 7, `sellerPickupDays` 5, `inspectDays` 3, `receivePresumptionDays` 7, `refundDays` 15, `codRefundConfirmSilenceDays` 7, `lateDeliveryGraceDays` 7, `returnWaiverMaxGoodsValue` 10,000, `refundOutboundDeliveryOnWithdrawal` true, `maxReturnShippingReimbursement` 5,000.
  - No enable switch: the withdrawal right applies to every P4 order.
  - The withdrawal period stays in P4's `AppSettings.orders.withdrawalDays`, the single source. P6 adds the validation that it and `returns.refundDays` cannot be set below 15 until a G1 row exists.
- **`disputes`:** `enabled` false, `submitAutoHours` 24, `respondHours` 72, `reminderHours` 48, `proposalHours` 72, `maxProposalRounds` 3, `reviewBusinessDays` 5, `maxInfoRequests` 2, `moderatorRefundLimit` 250,000, `notReceivedMaxDays` 60, `conformityWindowDays` 15, `counterfeitWindowDays` 60, `noShowWindowDays` 7, `evidenceRetentionDays` 1,095, `strikeEffectsEnabled` false, `sellerLossFee` 0, `gates` array `{ gate, clearedAt, clearedBy, evidence, note }` like P5.
  - `enabled` requires G2 and G3 rows. `strikeEffectsEnabled` and `sellerLossFee > 0` require G4.
- `GET /api/public/config` exposes `disputesEnabled`.
- When disputes are disabled:
  - "Report a problem" opens `/contact` prefilled with the order number;
  - dispute creation returns `dispute.disabled`;
  - returns, including P4's withdrawal request, work normally.

### Error codes

Added to `lib/errors.ts` with English fallbacks and translations in both clients:

- `return.notEligible`
- `return.windowClosed`
- `return.itemsInvalid`
- `return.alreadyOpen`
- `return.invalidTransition`
- `return.deductionEvidenceRequired`
- `return.deductionNotAllowed`
- `return.refundProofInvalid`
- `dispute.disabled`
- `dispute.notParty`
- `dispute.reasonNotAllowed`
- `dispute.windowClosed`
- `dispute.alreadyOpen`
- `dispute.returnCaseActive`
- `dispute.evidenceRequired`
- `dispute.evidenceLimit`
- `dispute.invalidTransition`
- `dispute.proposalInvalid`
- `dispute.refundExceedsOrder`

Existing codes reused: `upload.tooLarge`, `upload.invalidType`, `generic.rateLimited` (evidence uploads: 20 per hour per user), `moderation.forbidden`, `moderation.rankTooLow`, `moderation.invalidTransition`, `moderation.reasonRequired`, `refund.windowExpired` (P5).

### Web

Buyer:
- `/orders/[id]` (P4 page) gains:
  - "Return items" with the remaining withdrawal days;
  - "Cancel for late delivery" once eligible;
  - "Report a problem";
  - an active case or dispute banner linking to it.
- `/orders/[id]/return`:
  - item and quantity picker;
  - optional reason;
  - return method;
  - a summary of what is refunded, who pays return shipping, and the `shipBy` deadline.
- `/orders/[id]/problem`, a step-by-step flow:
  1. reason cards, filtered to reasons whose window is open, each with its deadline;
  2. items;
  3. description and evidence upload with camera or file, progress and per-file removal before submit;
  4. requested outcome;
  5. review: "The seller must prove delivery and conformity. BuyNSellem decides under its terms; you keep the right to go to court or a consumer association."
- `/returns/[id]`: status tracker, instructions, deadlines, ship form, deduction response, refund proof with confirm or contest.
- `/disputes/[id]`, the shared thread used by buyers, sellers and suppliers:
  - header with number, status chip, "Seller has until {date}" countdown, amount at stake, protected badge;
  - timeline merging messages, proposals, system events and the decision;
  - evidence gallery opening signed URLs in a viewer;
  - role-aware action bar (respond, accept, propose, contest, escalate, withdraw);
  - proposal card with accept or reject;
  - decision card with the public statement in the viewer's language, money effects and refund status, and certificate download.
- `/account/disputes`: buyer's returns and disputes.

Seller:
- `/seller/returns`: table with status, deadline, overdue filter.
- `/seller/returns/[id]`: receive, inspect per item with evidence, refund proof (COD).
- `/seller/disputes`: table and a standing card (active strikes, weight, restrictions, expiry dates). Rows open `/disputes/[id]`.
- Sidebar entries under Orders: Returns, Disputes.

Moderator (new staff-only web area, layout guarded by `isModerator`):
- `/moderation/disputes`: queue with number, reason, payment method, amount, status, deadline (red when overdue), assignee, age; filters; "Assign to me".
- `/moderation/disputes/[id]`, the arbitration workspace:
  - left: thread and evidence viewer (zoom, video player, EXIF `capturedAt`, `sha256` reuse warning);
  - right: order snapshot, system evidence, proof checklist, party history, resale roles;
  - decision form: outcome, amount with live breakdown preview (provider refund or seller-direct refund, commission credit, fee), return required, shipping payer, liable party, reason code, FR and EN public statement templates, internal note;
  - confirmation dialog listing every money and standing effect before submit;
  - "Request info" and "Redact message" actions.

### Mobile

New routes, registered in `app/_layout.tsx`:
- Buyer:
  - `app/orders/[id]/return.tsx`;
  - `app/orders/[id]/problem.tsx`: step-by-step flow with `expo-image-picker` camera and library, videos limited to 60 s, images resized to at most 2048 px JPEG quality 0.8 before upload, per-file retry;
  - `app/returns/[id].tsx`, `app/disputes/[id].tsx`, `app/account/disputes.tsx`.
- Seller:
  - `app/seller/returns/index.tsx`, `app/seller/returns/[id].tsx`;
  - `app/seller/disputes/index.tsx` with the standing card, rows opening `app/disputes/[id].tsx`;
  - the Shop hub gains Returns and Disputes tiles with counts of items awaiting action.
- Moderation:
  - `app/moderation/disputes/index.tsx` and `app/moderation/disputes/[id].tsx`, built on `ModerationScreen` and `DecisionSheet`;
  - the decision sheet shows the same effects summary as web;
  - `app/moderation/index.tsx` gains a Disputes section with overdue count.

### Internationalisation

Every string in English and French on web (`packages/web/messages/{en,fr}.json`) and mobile (`packages/mobile/src/locales/{en,fr}.json`) in the same change. Public statements are stored in both languages; templates per `reasonCode` prefill both. Decision certificates, return instructions, credit notes and the dispute terms are bilingual documents (Law 2011/012 art. 6). Party messages are user-written in one language.

## Testing

**Unit:**
- Transition tables for `return-cases` and `disputes`: every allowed and forbidden transition.
- Windows per reason and per basis, including the protected `paidAt + 80 days` cap and business-day computation for `reviewDueAt` across weekends.
- Silence defaults per reason, with and without seller proof (OTP verified, POD within and beyond 200 m).
- Proposal rounds, lapse, and escalation after round 3.
- Breakdown:
  - withdrawal of part and all of an order, with the outbound delivery setting on and off;
  - `non_conformity` with capped return shipping;
  - split allocation never touching the protection fee;
  - deduction limits.
- Commission credit note arithmetic and application to unpaid invoice, paid invoice and closed shop.
- `resolveDispute`:
  - party conflict and shop membership conflict;
  - wrong status;
  - amount bounds per outcome;
  - moderator refund limit vs admin;
  - burden-of-proof note requirement;
  - log metadata completeness;
  - a failure after the dispute update rolls back the case, strikes, signals and log together.
- Strikes: weights, 180-day expiry, `shopStanding` thresholds, effects off until `strikeEffectsEnabled`.
- Stock: each inspection outcome's movements; untracked variants; resale movements on the supplier variant.
- Reviews: held on open dispute, published 24 h after resolution, removal rules, verified flag removal on `cod_refused_abuse`.
- Resale routing with a P8 fake: liable party per reason, `adjustResellerCommission` calls, reseller COD refusal cost, collusion signal.
- Risk signals written in the causing transaction; `evidence_reused` on a duplicate `sha256`.

**Route:**
- Return creation: outside the window, undelivered items, over-quantity, excluded category locked without G1.
- Ship, receive and inspect permissions (buyer vs staff member vs non-member 403).
- COD refund proof, confirm and contest creating a `subject: refund` dispute.
- Dispute creation: disabled flag, non-party, reason not allowed for opener, window closed, already open, return case conflict, missing evidence at submit.
- Evidence: type and size limits, EXIF GPS stripped, signed URL for parties only, `staff` visibility hidden from parties, URL expiry at 5 minutes.
- Moderation disputes routes: queue ordering by deadline, assign, request info limit, resolve.

**Integration with P5 fakes:**
- Opening a dispute on a protected order creates the `dispute_open` hold, and P4 cannot complete the order.
- Full `resolved_buyer` issues one refund with key `dispute:{id}:refund` even when the resolution job runs twice; the hold is released after `succeeded`; the order ends `returned`.
- `resolved_split` issues a partial refund, releases the remainder at completion, and bases the commission invoice on the reduced amount.
- Refund after release takes the clawback path and issues a credit note.
- `refund.windowExpired` switches to `seller_direct`.

**Jobs:** time-travel tests for every deadline, run twice to prove idempotency.

**Clients:**
- Typecheck and biome on web and mobile.
- Manual pass on both:
  - withdrawal return end to end on COD with seller refund proof and buyer confirmation;
  - not-received dispute with seller silence and no proof (auto `resolved_buyer`);
  - not-as-described dispute with photos, seller proposal, buyer rejection, moderator split decision from web and from mobile;
  - protected-order dispute in the NotchPay sandbox with refund visible to the buyer;
  - held review published after resolution.

## Verification targets

- `bun run generate:types` in `packages/api`
- `bun run check-types` in `packages/api`, `packages/web`, `packages/mobile`
- `bunx vitest run --config ./vitest.config.mts` in `packages/api`
- `bun test` in `packages/mobile`
- `bunx biome check` on touched files
- Staging:
  - the manual pass above with `disputes.enabled = true` and P5 on sandbox;
  - production with returns on and disputes off until the G2 and G3 rows exist, then disputes on for Douala and Yaoundé;
  - weekly review of dispute volume, median time to resolution and overdue refunds alongside the D4 go/no-go metrics.

## Questions to send before implementation

### Lawyer

- L1 (G1): Which withdrawal period applies to online sales by a shop on a marketplace: 15 days (Law 2010/021 art. 20) or 14 days (Law 2011/012)? Does it run from delivery or from the contract? Is there a deadline for the consumer to send the goods back? Is the outbound delivery fee refunded? Are any goods excluded (perishables, personalised, hygiene, opened software)?
- L2: Do art. 21 (non-conformity, late delivery) and art. 25 (unavailability) set a refund deadline, and does art. 25 impose any sanction beyond refund?
- L3 (G2): Can BuyNSellem's terms make it the decision-maker on disputes between buyer and shop, and what must the terms say so the process is not a void liability-limiting clause (Law 2011/012 art. 5)? Is presenting it as non-binding, with court and consumer-association recourse preserved, sufficient?
- L4 (G2): Is applying art. 26's burden of proof as a platform rule (no seller proof means the buyer wins; silence defaults) enforceable against sellers? Are handover codes and courier GPS photos admissible proof of delivery?
- L5 (G4): Are strikes that restrict a seller's capabilities, and a fixed dispute fee invoiced to a seller who loses, enforceable penalty clauses in B2B terms with sole traders?
- L6: For COD orders, can BuyNSellem require the seller to refund directly and disclose the shop's RCCM and NIU in a decision certificate? Under what conditions can the owner's identity (from verification) be disclosed to a buyer?
- L7 (G3): Retention period for dispute evidence and decisions (Law 2010/021 art. 32, limitation periods for consumer claims), and whether evidence showing third parties needs specific notice or consent under Law 2024/017.
- L8 (G6): In resale, confirm that the supplier (seller of record) answers to the buyer for defects even when the reseller's listing caused the complaint (Law 2011/012 art. 20), and that recovering that loss from the reseller's unpaid commissions is lawful.
- L9 (from P5-L3): May the buyer protection fee be retained on a withdrawal after delivery or on a partial refund?
- L10 (from P5-L4): May BuyNSellem advance a buyer refund from its own revenue when a provider refund is impossible (after 90 days or insufficient seller balance) and recover it from the seller?

### NotchPay

P6 adds no new provider capability. It depends on P5's questions N5 (refund debit and application fee on destination charges, negative balances), N9 (account debits), N13 (refunds after 90 days) and one addition:

- N15: Can several partial refunds be issued on the same destination charge (for example a partial refund at inspection and a later one after a dispute), and is each refund's split between connected account and application fee reported in the `refund.*` webhook?
