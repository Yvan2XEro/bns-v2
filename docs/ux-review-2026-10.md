# UX/UI review — web and mobile (October 2026)

Read-only audit of the buyer and seller experiences on web (`packages/web`)
and mobile (`packages/mobile`), done on 2026-10-17 by reading the code and the
French copy. Nothing was tried on a device or in a browser; items that could
not be confirmed from the code are marked **(unverified)**. Gaps already
tracked in `docs/design-gaps.md` are not repeated here.

Benchmarks: Leboncoin, Vinted, Jumia (app and Seller Center), Facebook
Marketplace, Etsy, Shopify admin, WhatsApp Business — weighed against the
launch market: low-end Android, 360 dp screens, flaky 3G, data cost, cash on
delivery, mobile money, and WhatsApp as the default channel between buyers and
sellers.

## Diagnosis

The product is feature-rich; three weaknesses recur across every surface:

1. **Fragile on a poor network.** Nothing survives an app restart offline,
   drafts live only in memory, a failed chat message vanishes, photo uploads
   stop at the first error.
2. **The primary action is often buried.** Buy, Accept and Pay sit below long
   content on phones and tablets, and often share the visual weight of
   secondary actions.
3. **WhatsApp and the phone number — the real channels in Cameroon — are
   nearly absent from the buyer journey.** Sign-in is e-mail first, the
   revealed phone only offers `tel:`, sharing copies a link silently.

## Lot A — Quick wins (effort S each, high impact)

| # | Where | Problem | Fix |
|---|-------|---------|-----|
| A1 | Product page — web `app/(public)/listing/[id]/page.tsx:379-404, 530-581`; mobile `app/listing/[id].tsx:549, 822-870` | On phones, price and "Order" come after the description; the shop product price exists only in the buy box. The mobile sticky bar offers only Call and Message. "Choose a variant" shows in red before any interaction, even when out of stock (`buy-actions.tsx:278`). | Sticky bottom bar: **Order · price** as primary, Message and Call secondary. Price always under the title. Variant hint neutral until a buy attempt. |
| A2 | Mobile cart — `app/(tabs)/_layout.tsx:184-248` | No cart tab; `/cart` is reachable only from Account or after an add. | Cart icon with item-count badge in the home, product and shop headers. |
| A3 | Messages — web `messages-client.tsx:896-908, 548-555`; mobile `ConversationScreen.tsx:319-323` | Web disables typing as soon as the realtime socket drops and shows the raw `connecting` state in English. Mobile removes a failed optimistic message from the cache: the text is lost silently. | Input always enabled; outgoing queue with per-message state ("Not sent · tap to retry"); HTTP fallback; translated connection state; labels on the send button. |
| A4 | Web search price filter — `search-client.tsx:368-383, 241-252` | Every keystroke `router.push`es: one history entry and one server render per digit; Back becomes useless. | Local state applied on blur / "Apply"; `router.replace` for filter changes. |
| A5 | Product page safety tips — `listing/[id]/page.tsx:684-695`, `Listing.safetyTip3` | "Never send money in advance" sits next to "Pay now by mobile money" (protected payment). | Context-aware tips: shop product → "Pay only through BuyNSellem"; classified → meet in a public place. |
| A6 | Contact — web `phone-reveal.tsx:37-46`, `share-button.tsx`; mobile listing actions | Revealed number only offers a call; desktop share copies the link silently, no aria-label. | **WhatsApp** button (wa.me, prefilled message with listing link) after the reveal; explicit "Share on WhatsApp". |
| A7 | Seller order freshness — web `use-seller-orders.ts:95-104` (staleTime 30 s, no refetch interval), no bell in `seller-shell.tsx`; mobile `app/_layout.tsx:132` (staleTime 5 min, no `focusManager`/`AppState`) | Orders have a timed acceptance window, but the list and badge can be minutes stale. All pushes use the Android channel `"default"` (`api/src/hooks/notificationEvents.ts:250`). | 60 s refetch while orders are pending; refetch on app foreground; Novu bell in the seller header; "(2) Orders" in the tab title; Android channel "New orders" with its own sound and max priority; localised channel names. |
| A8 | Seller order detail — web `orders/[id]/order-client.tsx:86-103`; mobile `sellerOrders/ActionBar.tsx:99-108` | Below `lg` the action bar comes after buyer, summary, shipment and history blocks. On mobile all actions are `outline`: Accept looks like Refuse. | Primary action filled and pinned to the bottom (above the safe area); secondary outline; destructive as a red link. |
| A9 | Mobile post-publish — `fr.json:323, 383`, `create/index.tsx` | "Listing published!" while the body says it is pending review; then redirects to Account, not to the listing. | "Sent — under review", then a success screen: View listing / Share on WhatsApp / Post another. |
| A10 | Mobile money payment — mobile `checkout/[orderId]/pay.tsx:57`, `fr.json:3913-3914` | Empty phone field, operator chosen by hand, "dial the validation menu" without the code or a dial button. | Prefill the account/address phone; infer MTN/Orange from the prefix; button that dials the USSD code; exact amount on the pending screen. |
| A11 | Hard-coded strings — mobile `ListingCard.tsx:62-68, 180, 254`, `ConversationScreen.tsx:446, 467` (`fr-FR`), `CustomAlert.tsx:445`; web `listing-card.tsx:112`, `messages-client.tsx:548, 592, 836`, `page.tsx:429` ("1 vues"), `search-client.tsx:593` ("1 résultats"), `search-client.tsx:213, 598` ("My saved search"), JSON-LD breadcrumb `page.tsx:294, 300` | The English app shows French text; plurals and dates are wrong. | Message keys, ICU plurals, `Intl.RelativeTimeFormat`; extend the mobile keys test to flag literal strings. |
| A12 | Accessibility pass — mobile home (12 `Pressable`, 0 labels), listing page, cards (heart 30 px, `ListingCard.tsx:368`), bell 36 px (`home/index.tsx:1158`), photo delete 22 px (`create/index.tsx:1509`); web favourite button (`favorite-button.tsx:57-84`, button nested in a link, no `aria-pressed`), quantity ± `w-8`, gallery arrows without names (`image-gallery.tsx:93-118`) | Small targets, unnamed controls, invalid nesting. | 44 px minimum targets, labels and roles, summary label on listing cards, swipe + `object-contain` in the web gallery. |

Smaller items worth folding into Lot A:

- Favourite on web loses context at sign-in (`favorite-button.tsx:35-37`, no
  `redirect`), and a failure reverts the heart silently.
- Quantity stepper has no stock-bound maximum (`buy-actions.tsx:172, 255`).
- Expired listing stays contactable and JSON-LD always says `InStock`
  (`page.tsx:445-450, 663-674, 271`).
- Empty "My purchases" has no call to action (web `purchases-client.tsx:213`,
  mobile purchases tab); mobile purchase tab counts cover loaded pages only
  (`purchases/index.tsx:60-62`).
- Mobile courier space: cash "declare handed over" and rider assignment in one
  tap, no confirmation or amount (`app/courier/index.tsx:33, 49, 75-80`);
  uncoloured `<Text>` likely black on dark (unverified); plain-text empty lists.
- Brand spelled both "Buy'N'Sellem" and "BuyNSellem" in `fr.json`.

## Lot B — Express listing creation (effort M)

**Mobile** (`app/(tabs)/create/index.tsx`, `app/seller/product/[id].tsx`):

- The form lives only in memory (`useState(createEmptyForm)`, l.139): Android
  killing the app, a phone call or a flat battery loses everything. No
  `beforeRemove`/`usePreventRemove` anywhere; the "New product" close button
  calls `router.back()` without confirmation.
- Photos are added one at a time with a forced 4:3 crop (`allowsEditing`,
  l.1389-1400): about 40 taps for 8 photos. The product editor already allows
  multi-select without crop (`ProductPhotosCard.tsx:54`) — the two flows
  contradict each other.
- Uploads are sequential and blocking, a single error stops the batch with a
  generic message, and `api.upload` bypasses the offline pause
  (`create/index.tsx:1405-1433`, `ProductPhotosCard.tsx:65-85`).
- The first photo is always the main one; no reordering (l.1495-1515).
- Price has no thousands separator (l.947): "1500000" is easy to misread.
- Plain `ScrollView` while edit screens use `KeyboardAwareScrollView`
  (l.741, 914): the description may sit under the keyboard on small Android
  (unverified).

**Web** (`app/(public)/create/create-listing-form.tsx`, `product-editor.tsx`):

- No local draft for individual listings (the product editor has one for new
  products only, l.207); failures use `alert()` (l.529); photos are step 4;
  publish redirects straight to the listing with no share moment (l.527).
- No `beforeunload` guard anywhere in `src`.

**Proposal:**

1. Photos first: multi-select, no crop by default (optional crop on tap), one
   shared `PhotoPicker` for listing and product flows.
2. Local thumbnails immediately; background upload queue with automatic retry
   and per-photo state (uploading / failed — tap to retry); the real error
   reason.
3. Draft saved on the device (debounced ~500 ms) with "Resume your draft?",
   and a leave confirmation when dirty (mobile `usePreventRemove`, web
   `beforeunload` + breadcrumb guard).
4. Choose the main photo / reorder by long-press.
5. Price formatted while typing ("1 500 000 FCFA").
6. Success screen: View / Share on WhatsApp / Boost / Post another.
7. `KeyboardAwareScrollView` with next-field `returnKeyType` everywhere.

## Lot C — Poor-network resilience (effort M)

- **Persist the query cache across launches** (AsyncStorage/MMKV): home feed,
  favourites, purchases, conversations, seller orders, catalogue, dashboard.
  Today an app reopened offline is empty — the offline banner (M21) protects
  only the running session. No `persistQueryClient` exists in the package.
- **Refetch on foreground**: wire TanStack `focusManager` to `AppState`.
- **Instant product page**: use the listing already cached from the list as
  `placeholderData` (photo, price, title) instead of a full-screen spinner
  (`app/listing/[id].tsx:271`); skeleton for the rest.
- **Lists on FlashList** (home, search `search/index.tsx:552`, favourites)
  with the listing id as key — today hand-built rows keyed by index. FlashList
  2 is already installed (cart, purchases).
- **Continuous home feed**: it stops at 20 items (`home/index.tsx:~325`,
  `limit=20`, `ScrollView`).
- **Mobile image viewer**: zoom relies on `ScrollView maximumZoomScale`
  (iOS only), no swipe between photos, no swipe-down to close
  (`app/listing/[id].tsx:874-930`).
- **Push permission in context**: asked right after sign-in with no priming
  (`_layout.tsx:296-303`); ask at the first message sent or order placed.
- **Web**: cards prefer the original `url` over `thumbnailURL`
  (`listing-card.tsx:36`); missing `loading.tsx` for cart, purchases, `/shops`,
  `/s/[handle]`.

## Lot D — Web seller space (effort S–M)

| # | Where | Problem | Fix |
|---|-------|---------|-----|
| D1 | `orders/orders-client.tsx:100-105`, `catalogue/catalogue-client.tsx:63-71` | Filters, search, page and sort live in local state: coming back from a detail loses them; a view can't be shared with a teammate. The moderation log already keeps filters in the URL. | One hook syncing list filters with the URL (`router.replace`). |
| D2 | `orders-table.tsx:162` (`min-w-[900px]`), `catalogue-table.tsx:176` (`min-w-[880px]`) | Horizontal scroll on tablets/phones; status and action off-screen. | Card layout below `md`. |
| D3 | `lib/seller-nav.ts`, `seller-sidebar.tsx:165, 197` | 13 flat entries; below `lg` a scrolling strip, and "View my shop", "Buyer mode" and theme disappear. | Groups — Sales (Orders, Returns, Disputes), Catalogue (Products, Stock, Resale), Shop (Delivery, Payments, Team, Verification, Settings); bottom bar on small screens. |
| D4 | Printing exists only for inventory and resale | Nothing printable with reference, address and amount to collect for cash on delivery. | A6 delivery slip with order QR, single or batch from the selection. |
| D5 | `catalogue-client.tsx:97-102`, `use-catalogue-actions.ts:19` | Bulk status change: no toast, no confirmation or undo for Archive. | "12 products archived · Undo". |
| D6 | `runOneByOne` in orders | Accepting 20 orders on 3G shows only a disabled button. | "7/20" progress, retry failures only. |
| D7 | `orders/[id]/buyer-block.tsx:70` | Buyer contact is call-only. | WhatsApp with a prefilled message (order number, slot) when the number isn't masked. |
| D8 | Moderation console — no `onKeyDown` in `app/(ops)`, `decision-dialog.tsx:199-216` | No keyboard shortcuts; seller message written from scratch. | j/k, a/r, `/`, `?` cheat sheet; per-reason prefilled message templates in the seller's language. |
| D9 | `app/(ops)/moderation/*/page.tsx:4-5` | Tab titles hard-coded in English and identical across sheets. | Translated `generateMetadata` with shop name / dispute number. |
| D10 | `components/moderation/shop-sheet.tsx` (7 sections, ~1200 lines) | Long scroll between identity, sanctions and payments. | Sticky anchors or tabs with counts. |
| D11 | Seller guide reachable only from a home card (`seller-home.tsx:218`) | Hard to find again. | "Help" in the sidebar footer; contextual "?" links on Payments, Delivery, Verification. |

## Lot E — Search and discovery

- **Delivery / cash on delivery / protected payment** chips on listing cards
  (web `listing-card.tsx:118-153`, mobile `ListingCard.tsx`) and the matching
  filters — today no filter for any of them.
- **One mobile search**: the home has its own search mode
  (`home/index.tsx:130-280`) without recents, category suggestions or shop
  results, while `(tabs)/search` (hidden, `href: null`) has them. Tapping the
  field should open the full search screen with the keyboard up.
- **Zero results**: offer "Notify me" (saved search), widen the city, nearby
  categories (`search-client.tsx:710-724`); the saved-search payload omits
  `tags` and `verified` (l.215-224).
- **"Back to results" keeps the query** (`listing/[id]/page.tsx:345-351` links
  to bare `/search`).
- **Filters button shows the count** ("Show 128 listings") and adds delivery,
  payment and shop/individual filters (mobile `filters.tsx`).
- **Home on mobile web**: two search bars on `/` (header + hero) and a tall
  hero (`header.tsx:258-260`, `page.tsx:98-120`); hide the header search on
  `/`, shorten the hero, bring recent listings up.
- **Relevance (unverified)**: the search API appends `createdAt:desc` when no
  sort is requested (`api/.../public/search/route.ts:565-591`) and the web
  offers no "Relevance" option; the effect depends on the index ranking rules.
- **Favourites (unverified)**: a sold or hidden favourite seems to disappear
  without explanation (`favorites/page.tsx`, `filter(Boolean)`).
- **Mobile cart**: delete without undo, quantity changes not optimistic, one
  `busy` flag blocks the whole cart (`cart.tsx:47`, `useCart.ts:67-80`).

## Status (2026-10-17, end of day)

Lots A to E are implemented on `dev`, one commit per item or group, each
with its tests, type-checks and the web build and Android bundle green.
What remains or differs from the proposal:

- **A8, mobile:** already right in the code. Accept is filled and the action
  card sits near the top, so nothing changed. On web the actions now come first
  below `lg`, and refusing reads as a red link.
- **A9:** delivered with Lot B (success screen on mobile, "sent" banner on web).
- **A11, brand spelling:** left as it is. Web's `siteName` and the payments and
  disputes copy (byte-identical across clients) say "Buy'N'Sellem", while other
  strings say "BuyNSellem". Pick one and it is a find-and-replace across both
  clients.
- **A11, literal-string lint in the mobile keys test:** not added.
- **Lot B, web photos:** files cannot be kept in the browser, so a resumed draft
  asks for its photos again (the banner says so).
- **Lot C, home feed:** "Show more" pages through the recent listings, rather
  than infinite scroll inside the sectioned home.
- **Lot C, web cards:** the original `url` is kept. `next/image` already
  resizes it, so it was not worth changing.
- **Lot E, delivery and cash-on-delivery chips and filters:** neither is in the
  search index. What shipped is **Buy online** (`orderable`: protected payment
  or cash on delivery), a badge plus a filter on web and mobile. Separate
  delivery and COD filters need the indexer to carry the shop's order settings
  and a reindex.
- **Lot E, the home's in-place search on mobile:** still there for the filters
  sheet's return and the category chips. The field itself now opens the full
  search screen.
- **D8, a/r keys and the seller's language:** shortcuts cover navigation, take
  next and help, but not approve and reject, which open dialogs with required
  fields. Message templates follow the moderator's language, because the
  seller's language is not on the request.
- **Measuring:** `listing_started`, `listing_published` and `message_failed`
  join the funnel events, to compare against before and after once PostHog is
  configured.
- **Big bets:** untouched. Each needs a product decision first.

## Big bets (decide separately)

1. **Phone-number sign-in with an SMS/WhatsApp code.** Today: e-mail +
   password (+ Google/Apple); registration asks name, e-mail, password and
   confirmation, then e-mail verification. In Cameroon the phone number is the
   real identity (mobile money, WhatsApp) and many users have no active
   e-mail. Removes the main sign-up friction and yields a verified number as a
   trust signal. Touches authentication — needs its own spec. Also: resume the
   interrupted action after sign-in (add to cart, favourite).
2. **WhatsApp-native commerce.** Rich WhatsApp cards for listings and shops,
   order tracking / pending payment / handover code / dispute updates pushed
   on WhatsApp, "Message the seller" falling back to WhatsApp when realtime
   chat is unavailable; on the seller side, per-step WhatsApp templates. The
   in-app chat stays the record of truth.
3. **Negotiation and trust inside the chat.** Quick replies ("Still
   available?", "Best price?"), photo messages, a "Make an offer" card the
   seller accepts or declines that turns into a protected-payment order
   (Vinted offers), trust badges on cards (delivery, protected payment,
   verified shop, response time). The chat today is text-only and loads the
   last 100 messages with no older history (`[conversationId].tsx:39`).
4. **One design system for web and mobile.** A `@bns/tokens` package (JSON →
   CSS + TS); mobile has three colour sources (`constants/theme.ts`,
   `components/shop/theme.ts`, literals — 29 in `create/index.tsx`, 37 in
   `listing/[id]/edit.tsx`, 381 `isDark ?` branches); shared `EmptyState`,
   `Toast`, `PhotoPicker`, `PrimaryActionBar`; toasts instead of blocking "OK"
   dialogs on mobile (`AlertContext.tsx:79`, 32 `showSuccess` calls, untranslated
   "OK"); a lint rule against literal colours; one icon set (lucide on both,
   or a lucide ↔ Ionicons map).
5. **Rider flow inside the app.** Today only "Pick up" works in the app;
   failed attempt and handover code send the rider to the SMS link
   (`app/rider/shipment/[id].tsx:96-104`). Reuse `HandoverKeypad` and
   `DeliveryFailureSheet`, show the cash amount as a large banner, the pickup
   address and the parcel items, with a pinned primary button.

## Already strong (keep)

`expo-image` with blurhash and thumbnails; optimistic favourites; the pending
payment screen (countdown, local reminder, retry, switch to cash on delivery);
haptics on tabs and favourites; keyboard-controller in the chat; FlashList in
cart and purchases; COD and return-window chips in the buy box; the seller
onboarding checklist, tips and guide; WhatsApp shop sharing; bulk
accept/refuse on orders; the moderation console's auto-advance and URL
selection.

## Note on the "living home" prototype

Consistent with Lot C (continuous feed) and Lot E (one search). Parallax and a
collapsing header are costly on low-end Android: prototype on a 2 GB RAM
device, with an automatic fallback when a data-saver mode is on.

## Recommended order

1. Lot A — most visible gains for the least risk.
2. Lot B — express listing creation (time to first listing).
3. Lots C, D, E.
4. Big bets after a product decision on each.

Each lot on its own branch, verified with tests, type-checks and builds.
