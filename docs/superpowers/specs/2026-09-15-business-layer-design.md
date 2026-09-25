# Business Layer Design

Date: 2026-09-15
Status: approved (decisions D1–D5 validated by the product owner on 2026-09-15)

## Goal

Add a business layer to BuyNSellem: anyone can open a shop, get it verified, sell with real orders, and resell products from verified suppliers — while individuals keep posting simple classified ads.

This document is the umbrella for the whole initiative. It records the validated decisions, the target architecture and the delivery roadmap. Each roadmap phase gets its own spec, plan and implementation cycle:

- `2026-09-15-p0-foundations-design.md`
- `2026-09-15-p1-shops-design.md`
- `2026-09-15-p2-verification-design.md`, `-p3-team-`, `-p4-cod-orders-`, `-p5-protected-payment-`, `-p6-disputes-returns-`, `-p7-delivery-`, `-p8-resale-` and `-p9-insights-fraud-design.md`.

## Positioning

The real competitor is informal commerce on WhatsApp and Facebook, not Jumia. Its weakness is trust: more than 1bn FCFA was lost to online scams in Cameroon in 2025, typically a fake seller asking for a mobile-money deposit. BuyNSellem wins on three things WhatsApp cannot offer:

1. shops whose identity is verified, with a readable verification level;
2. a protected payment where the buyer's money is released only after delivery;
3. delivery that is tracked on the platform, with proof of handover.

It does not win by owning logistics or stock. Copia and Sendy were liquidated doing that, and Jumia left Cameroon in 2019 and is still loss-making.

## Market facts that shape the product

- Online retail still runs on cash on delivery (COD). Even Jumia collects only about 28% of GMV online (FY2025). Expect 15–25% of COD orders not to complete (Jumia disclosed 14.4% in 2018 and 16% in 2020).
- Mobile money is mainstream, but 65% of CEMAC mobile-money merchant payments are airtime (2024, unverified primary source). Buyers are not yet used to paying strangers online.
- NotchPay fees: 2% on collections, 1% on mobile-money transfers.
- Classic international dropshipping does not work: Cameroon has no duty-free threshold (5–30% duty + 19.25% VAT + levies) and AliExpress delivery takes 45–90 days.
- Local reseller networks do work: Taager serves 45,000+ social sellers with supplier stock, delivery and COD collection.
- Last mile: Yango Delivery operates in Douala (no public merchant API found); Campost is building e-commerce hubs; addresses are unreliable, so delivery relies on a GPS pin plus a phone call.

## Legal framework that shapes the architecture

This is a reading of public texts, not legal advice. The items marked "gate" must be confirmed before the phase that depends on them.

| Text | What it imposes | Architectural consequence |
|---|---|---|
| CEMAC Regulation 04/18 on payment services | Only licensed institutions provide payment services, including money transmission (art. 5); client funds segregated (art. 53); unlicensed activity can be closed (art. 84). No commercial-agent exemption. | BuyNSellem never holds buyer funds, never runs wallets or seller balances. A licensed provider collects, holds and pays out. **Gate for P5.** |
| Law 2010/021 on electronic commerce | Pre-contract information (art. 15), order summary and confirmation (art. 17), 15-day withdrawal right (art. 20), burden of proof on the seller (art. 26), RCCM and taxpayer numbers displayed (art. 30), transaction data retained (art. 32). | Orders — even COD — need a confirmation step, a receipt, a withdrawal request flow and retained history. Account deletion must not erase transaction records. |
| Framework law 2011/012 on consumer protection | Liability-limiting clauses void (art. 5); contracts and product information in French and English (art. 6, 13); liability extends along the distribution chain (art. 20). | Bilingual order documents and terms. In resale, the supplier stays liable whatever the contract says. |
| Law 2024/017 on personal data | Prior authorisation for processing and for transfers abroad; biometrics are sensitive; transition ended 23 June 2026 (secondary sources). | Store the KYC vendor's reference and result rather than raw images where possible. Hosting and KYC vendors abroad need authorisation. **Gate for P2.** |
| Apple 3.1.1 / 3.1.3(e), Google Play payments policy | Physical goods and services must use non-IAP payment. Digital features and subscriptions unlocked in the app require IAP. Outside the US, no link to external purchase. | Orders and their commission stay outside IAP. Anything digital (boosts, a paid shop subscription) must not be sold through the mobile apps except via IAP. The current mobile boost stub is already compliant and stays. |

Blocking finding: the Treasury's list of licensed payment institutions (DGTCFM, July 2026) names only Orange Money and MTN Mobile Money. NotchPay — the only local provider documenting a marketplace mode (NotchPay Sync: connected accounts, destination charges, application fee) — is not on it. P5 cannot start without NotchPay's written confirmation of its licence or partner bank.

## Validated decisions

### D1 — Seller of record: each shop

Every shop is the legal seller and carries the Law 2010/021 obligations. BuyNSellem hosts, verifies, arbitrates and takes a commission. BuyNSellem never sells in its own name.

### D2 — Revenue model: commission on delivered orders plus a buyer protection fee

- Commission charged only on delivered orders, never on cancelled ones. Working hypothesis: 5–10% by category.
- A buyer protection fee on protected payments. Working hypothesis: 3–5%.
- Both are tied to physical goods, so they sit outside Apple and Google in-app purchase.
- Verification is free.
- A paid "Boutique Pro" subscription is deferred. If it comes, it is sold through IAP on mobile or on the web only, with no purchase link in the apps.
- Commission on COD orders is invoiced to the seller, who settles it by mobile money. That is payment for a platform service, i.e. BuyNSellem's own revenue, not third-party funds.
- VAT at 19.25% applies to the commission.

### D3 — Resale model: affiliate resale

The supplier is the seller of record and receives the buyer's payment through its connected account. The reseller markets the item in their own shop and earns a commission that BuyNSellem pays out of its own platform revenue (the application fee covers platform fee plus reseller commission). This works with NotchPay Sync as documented (one destination plus an application fee), and product liability rests with whoever holds the stock. International supplier connectors (AliExpress, CJ) are out of scope.

### D4 — Launch zone: Douala and Yaoundé, same-city delivery

Orders launch in Douala and Yaoundé with same-city delivery. Completion rate, COD refusal rate and payout delay are reviewed weekly as go/no-go gates before widening.

### D5 — Registration requirement: graduated

- COD orders are available from level 1.
- Protected payment requires level 2.
- Supplier capability requires level 3.
- RCCM and NIU are displayed on the shop page whenever the shop has provided them.
- The rule tightens if the lawyer confirms that Law 2010/021 art. 30 requires registration for every habitual online seller.

## Target architecture

### Products carry stock, listings publish them

A shop manages products, not ads.

- **Product**: the operational object — variants, stock, purchase cost, delivery settings.
- **Listing**: the product's public face. Search, moderation, favourites, reports, conversations, boosts and category forms keep working on one entity, for individuals and shops alike.

Collections:

- **`products`**: owned by a shop.
  - Title, description, category and attributes, media.
  - Status `draft | active | archived`.
  - Delivery and return settings, resale settings.
- **`product-variants`**:
  - Options (e.g. colour × storage) and SKU.
  - Price and purchase cost; the cost stays private to the shop.
  - `stockOnHand`, `stockReserved`, low-stock threshold, `trackInventory`.
  - A product without options has a single default variant.
- **`stock-movements`**: append-only.
  - Each row: variant, type `receipt | sale | reservation | release | adjustment | loss | return`, signed quantity, reason, actor, order reference.
  - `stockOnHand` and `stockReserved` on the variant are caches of this ledger. They are updated in the same transaction, with a conditional atomic update.
- **`listings`**: gains `shop` and `product`.
  - An active shop product publishes exactly one listing in its own shop. The product service creates it and keeps it in sync: title, photos, price range and availability come from the product and cannot drift.
  - Shop listings do not expire and are not limited to three images.
  - A listing can point to another shop's product: that is resale (see below). One supplier product can be published by many listings while its stock stays in one place.

Individuals keep posting standalone classified listings with no product, exactly as today. No data migration.

### Shop as an actor

- `shops`: handle, name, description, branding, contact, location, status, verification level, capabilities, suspension. Service-owned fields are pinned in `beforeChange`, like user suspension fields today.
- `shop-members`: `owner | manager | staff`. P1 creates owner rows only; P3 adds invites and the other roles.
- Reviews, reports, conversations and moderation extend to shops. Suspending a shop takes its listings down, blocks new orders and freezes payouts.

### Verification levels

| Level | Name | Requires | Unlocks |
|---|---|---|---|
| 0 | Account | nothing beyond an account | classified ads, as today |
| 1 | Shop | verified phone (P1); verified email once that flow exists; payout-account name match once payout accounts exist (P4/P5) | open a shop; COD orders with daily caps (P4) |
| 2 | Verified identity | ID card or passport, selfie liveness, face match via a vendor covering Cameroon (Didit or Smile ID) | protected payment, badge, team members, higher caps |
| 3 | Verified business | RCCM or entreprenant declaration, NIU, manager's ID — manual review, no registry API exists | supplier capability, custom features, faster payouts |

The current `verified` checkbox is replaced by these levels in P2. Verification documents live in a private bucket, never in the public `media` collection, are readable only by moderators through short-lived signed URLs, and are purged by a retention job.

### Orders

- Three independent statuses per order: `status`, `paymentStatus`, `fulfillmentStatus` (per item). One service writes them through a transition table.
- `order-events` is an append-only timeline feeding the tracking screen and system chat messages.
- An order has exactly one fulfilling shop (the shop holding the stock). A checkout whose items come from several fulfilling shops creates one order per fulfilling shop, grouped by a checkout group. The server-side cart is single-shop at launch (P4), and multi-shop checkout arrives in P10.
- `paymentMethod` is `cod | mobile_money` (mobile money is the protected payment of P5). `paymentStatus` is one of `unpaid | awaiting_payment | paid | cod_pending | cod_collected | cod_refused | refunded | partially_refunded | failed`, defined by P4.
- Stock is reserved at placement, released on cancellation, refusal or failed delivery (once the goods are back), and converted to a sale at delivery, for own and resale items alike.
- COD: `placed → confirmed → accepted → shipped → delivered → completed`. Confirmation by SMS or seller call; handover confirmed by a one-time code from the buyer; refusals feed a per-phone refusal score.
- Protected payment: `placed → paid → accepted → shipped → delivered → completed + payout`. Unpaid after 30 minutes → cancelled and stock released. Seller must accept within 48 hours. Auto-complete at the end of the 15-day withdrawal window.
- Exits: `cancelled`, `delivery_failed`, `returned`, `disputed`.

### Money

- `payment-intents` is the single record of every money attempt (P0), with monotonic status, integer amounts, currency and idempotency key.
- `webhook-events` stores each provider event once before processing (P0).
- Protected payments use NotchPay Sync destination charges: funds sit in the seller's connected account at the provider, BuyNSellem receives only its application fee.
- A double-entry ledger mirrors what the provider did (pending, available, commission, refunds). It never holds or moves money and is reconciled nightly against provider reports.
- Payouts go to the seller's mobile-money account in their verified name.

### Resale (affiliate model)

- A level-3 supplier enables resale on its own products, per variant: supplier price, suggested retail price, minimum retail price, handling time, COD accepted. There is no separate offers collection.
- A reseller clicks "Resell": a listing appears in their shop, with `product` pointing to the supplier's product and the price they chose. Stock stays with the supplier, so the reseller has nothing to count or sync.
- A supplier can require approval of resellers (`resale-links`: `requested | approved | suspended`).
- An order creates a `purchase-order` routed to the supplier, who ships in the reseller's name. The buyer sees the reseller shop and "ships from Douala".
- Terms written before launch: defects and non-conforming items are on the supplier; delivery cost of a refused COD order is on the reseller; reseller commission is paid only after the dispute window.
- Anti-fraud from day one: detect buyer–reseller–supplier collusion (Jumia lost about 1% of GMV to JForce agent fraud); cap payouts for new resellers.

### Delivery

- Seller-arranged but platform-tracked first: status, GPS pin, proof of handover by code or photo.
- Delivery zones per shop (cities, fees, free-above threshold, ETA) and pickup points.
- A `CourierProvider` interface, mirroring `PaymentProvider`, for Yango, local couriers and later Campost.

### Interfaces

One account, two hats, in the style of Facebook Pages or Instagram professional accounts:

- Buyer hat (default): Home · Explore · Sell · Messages · Account. Shop pages at `/s/{handle}`, follow a shop, level badge on cards, "My purchases" in Account.
- Seller hat (acting as a shop): Dashboard · Orders · Add · Messages · Shop.

Implemented as two distinct route groups rather than a conditional tab bar, which is a known source of navigation bugs with expo-router. The detailed screen map is its own project; each phase adds its entries to the existing navigation until then. Current incoherences to resolve in that project: duplicated favourites on mobile, "Settings" meaning different things on web and mobile, moderation screens on mobile only.

## Roadmap

| Phase | Content | Depends on | Gate |
|---|---|---|---|
| P0 Foundations | Payment intents and webhook events, boost hardening, phone privacy, honest reviews, Mongo replica set, search fixes, retained payment records | — | — |
| P1 Shops and catalogue | Shops, owner membership, products with variants and stock, stock movements, auto-published shop listings, `/s/{handle}`, shop search, shop moderation, level 1 | P0 | — |
| P2 Verification | Verification requests, private documents, KYC vendor, review queue, levels 2–3, badges, retention | P1 | Data-protection authorisation |
| P3 Team | Shop members and roles, invites, shared shop inbox, activity log | P1, P2 (`shopCapabilities`) | — |
| P4 COD orders | Cart, orders and timeline, stock reservation and release on orders, handover code, tracked seller delivery, Law 2010/021 obligations, verified-purchase reviews, refusal score, commission invoicing | P1, P2 | — |
| P5 Protected payment | NotchPay Sync connected accounts, application fee, payout after delivery, refunds, mirror ledger, buyer protection fee | P0, P2, P4 | NotchPay written licence confirmation; lawyer opinion |
| P6 Disputes and returns | Disputes, evidence, moderation arbitration, refunds and clawbacks | P4, P5 | — |
| P7 Integrated delivery | Zones and fees, shipments, courier adapters | P4 | — |
| P8 Resale | Resale settings on supplier products, reseller approvals, Resell action, purchase orders, affiliate commissions, return rules | P2 (level 3), P3, P4, P6 | NotchPay confirmation of the affiliate flow for prepaid orders |
| P9 Insights and fraud | Daily shop stats, risk flags, velocity limits (essential caps ship with P4) | P4 | — |
| P10 Beyond | Multi-shop cart, multi-currency and multi-country (one provider and one regulatory review per country) | P5, P8 | Per-country review |

P3 and P4 can run in parallel once P2 has shipped (P4 uses the P3 shop inbox when it exists and falls back to the owner otherwise); P7 can run in parallel with P5 and P6 once P4 has shipped. The NotchPay and lawyer conversations start during P1, not after.

## Adjustments made while writing the phase specs

- Private storage for verification documents moves from P0 to P2, the first phase that needs it.
- Shop items are products with stock, validated by the product owner after the first mockups. Products, variants and stock movements move from P4 to P1, and a listing publishes a product instead of carrying commerce fields itself. The `listing-commerce` and `supplier-offers` collections are dropped.
- The seller hat's Shop tab is the management hub: catalogue, stock, resale, delivery, payments, team, verification, settings. The desktop seller space mirrors it with a sidebar and is the primary place for catalogue and stock work.
- Level 1 in P1 requires a verified phone only. No email verification flow exists today, and payout-account name matching needs payout accounts, which arrive in P4/P5.

## Actions outside code

### Questions for NotchPay (in writing)

1. Licence or partner bank, and the segregated-account arrangement (Regulation 04/18 art. 53).
2. Can Sync hold funds until delivery is confirmed, with delayed or manual payouts?
3. Refunds on destination charges: who is debited, and what happens to the application fee?
4. Is a split to several connected accounts possible, or is the affiliate model (one destination plus application fee) the supported path?
5. Who bears the 2% collection fee on a destination charge with an application fee?
6. What KYC does NotchPay run on connected accounts, so BuyNSellem does not duplicate it?

### Questions for a Cameroonian lawyer

1. Does a marketplace collecting and later paying out count as money transmission under Regulation 04/18? Are we exposed by using an aggregator absent from the licence list?
2. Who carries the withdrawal right, platform or shop, and which period applies: 14 days (Law 2011/012) or 15 days (Law 2010/021)?
3. Must a habitual online seller be registered (Law 2010/021 art. 30)? Is a CNI receipt acceptable proof of identity?
4. Tax and legal qualification of reseller commissions in the affiliate model.
5. What the 2026 finance law's "real-time taxation" of platforms requires.

### Data protection

1. Declare or request authorisation for processing, and keep the processing register with retention periods.
2. Request authorisation for transfers to the KYC vendor and to hosting outside Cameroon (database, file storage).

## Sources

Research conducted on 2026-09-15. Full source list with dates in the published analysis artifact. Key primary sources:

- CEMAC Regulation 04/18: https://www.sgg.cg/txts-droit-reg/cemac-reglement-2018-04-services-paiement.pdf
- Law 2010/021: https://www.mincommerce.gov.cm/sites/default/files/documents/loi-n-2010-021-du-21-decembre-2010-regissant-le-commerce-electronique-au-cameroun.pdf
- Law 2011/012: https://www.mincommerce.gov.cm/sites/default/files/documents/loi-cadre-n-2011-012-du-06-mai-2011-portant-protection-du-consommateur-au-cameroun.pdf
- DGTCFM licensed institutions: https://dgtcfm.cm/les-etablissements-financiers-agrees-aucameroun/
- NotchPay Sync: https://developer.notchpay.co/sync/index.md
- NotchPay pricing: https://notchpay.co/pricing
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play payments policy: https://support.google.com/googleplay/android-developer/answer/9858738
- Jumia FY2025 results: https://investor.jumia.com/news/news-details/2026/Jumia-Reports-Fourth-Quarter-and-Full-Year-2025-Results/default.aspx
