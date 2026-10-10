# Web UX Alignment Design

Date: 2026-10-10
Parent: `2026-09-15-business-layer-design.md` (§ Target architecture: "The seller hat's Shop tab is the management hub… The desktop seller space mirrors it with a sidebar and is the primary place for catalogue and stock work.")
Direction: the `bns-design` canvases (`../../../../bns-design/*.dc.html`). The 1440px canvases (`Web*`, `OpsWeb*`, `P1Web*`, `BuyWebCheckout`) define the web shells; the 390px canvases define information architecture where no web canvas exists. The canvases are the direction; this spec aligns the app to them and states every deviation.

## Goal

One coherent shell architecture for `packages/web`, replacing the accretion of P4→P9 screens bolted into whatever shell existed. The owner's words: the shop-management layout is mixed up with the public layout; even the loading skeleton changes while you are in the seller context; opening some seller pages looks like landing on the home page; sending a chat message from the seller context switches context entirely.

After this work:

- Every page belongs to exactly one shell, decided by the **actor** performing the task, never by which collection the page reads.
- An actor never leaves their shell for a task that belongs to it. A seller handles orders, returns, disputes, payments, delivery, team, verification, insights **and the shop inbox** without the sidebar ever disappearing.
- Each shell has its own layout, its own loading skeleton and its own error boundary. Navigating within a shell swaps only the content pane; the chrome never flickers, and no skeleton ever shows another shell's anatomy.
- URLs do not move except where stated (one move, two splits), each with a redirect or a stated reason.

## Out of scope

- Mobile (`packages/mobile`): its own alignment pass later — the owner has not tested it yet. Nothing here touches `packages/mobile`, and web URL changes must not break the one shared convention (`/r/[token]` rider links sent by SMS).
- Visual re-skinning beyond shell/skeleton coherence. The canvases' tokens (colors, Outfit/DM Sans, badge and status chips) already exist in `globals.css` and the components; this spec moves walls, not paint.
- New features. The ops shell gets the canvases' *anatomy* but only its two existing sections (verification, disputes); the other `OpsWeb*` sidebar entries (queue, reports, risks, shops, journal) arrive with their phases.
- Multi-shop UX beyond the existing `ShopSwitcher`.
- API changes. The shells consume only endpoints that exist; if any step turns out to need a new type or helper from `packages/api`, it goes through `src/contracts/` per the deploy-slice rule in `AGENTS.md` — the web Docker image ships only that slice, and `bun run build` in `packages/web` is the gate.

## Current state (verified 2026-10-10)

### The root shell wraps everything

`app/layout.tsx` mounts `Header` + `CategoryBar` before `{children}` and `Footer` after, for **every** route. The only escape is `components/layout/site-chrome.tsx`, a client component that returns `null` when `pathname.startsWith("/r/")` — the rider page hides the public chrome by a client wrapper hack (w7's concern): the chrome components still mount and the exemption is a string prefix list in a component, not a route boundary.

- `app/seller/layout.tsx` renders `SellerShell` (sidebar + content) **inside** the public chrome: the sidebar is `sticky top-14` because the public header (h-14) is still above it, and the public category bar and marketing footer render around the seller workspace.
- `app/moderation/layout.tsx` is a `notFound()` gate plus a two-link `<nav>`, also inside the full public chrome.
- `app/shop/manage/layout.tsx` duplicates the seller layout (same `getMyShop` gate, same `SellerShell`) because shop settings live outside `/seller/*`.
- Checkout pages render in the full public shell — category bar and marketing footer included — where `BuyWebCheckout.dc.html` shows a focused page: public header kept, breadcrumb "Retour au panier / Commande / Commande sécurisée", no category bar.

### The loading skeleton is the home page

`app/loading.tsx` is a **home-page skeleton**: blue hero band, category circles, listing-card grid. It is the nearest loading boundary for every segment that lacks its own, and `/seller/**` has **none** (`find app -name loading.tsx`: root, create, favorites, listing/[id], messages, profile/me, profile/me/listings, search). So a cold load or hard navigation to `/seller/orders` paints the home hero skeleton full-screen — sidebar gone — then swaps to the workspace. This is, verbatim, "opening some seller pages looks like landing on the home page" and "the loading skeleton changes while you are in the seller context".

### Seller tasks that eject the seller

- `app/seller/disputes/seller-disputes-client.tsx:52` links to `/disputes/{id}` and `app/seller/returns/seller-returns-client.tsx:54` to `/returns/{id}` — both render under the **public** shell. A seller triaging a dispute from the workspace lands in the buyer chrome.
- `lib/seller-nav.ts` puts a `messages` entry (`/messages`, the personal buyer chat) in the seller sidebar next to the `inbox` entry (`/seller/messages`). The shop inbox (`InboxClient`: conversation list, thread panel, assignee picker — already the `OpsShopInbox` shape) exists, but one sidebar click away sits a link that drops the seller into the public shell — "sending a chat message from the seller context switches context entirely".
- Shop settings are `/shop/manage` (plus `?move=1` for moving listings), outside `/seller/*`, with their own copy of the shell wiring.

### Auth and gating today

`src/middleware.ts` protects `/courier /create /favorites /messages /profile/me /seller /settings /shop` by cookie presence. `/purchases`, `/returns/[id]`, `/disputes/[id]`, `/account/*`, `/checkout` self-gate in the page (`getAuthUser()` + redirect). `app/moderation/layout.tsx` gates by role with `notFound()`. `app/seller/layout.tsx` gates by `getMyShop()` and redirects to `/shop/new`.

### Page → shell map

82 pages. "Today's shell" — **Public** = header + category bar + footer; **Public+SellerShell** = the seller workspace nested inside the public chrome; **Bare (hack)** = public chrome suppressed by `SiteChrome`. Target shells are defined in Design § 1. Canvas: the governing canvas; "(IA)" marks a 390px canvas used for information architecture only; "—" means no canvas exists and the page only inherits its shell.

| Route | Today's shell | Target shell | Change | Design canvas |
|---|---|---|---|---|
| `/` | Public | `(public)` | REWRAP | WebHome |
| `/search` | Public | `(public)` | REWRAP | WebHome grid; MobileSearch (IA) |
| `/listing/[id]` | Public | `(public)` | REWRAP | WebListing |
| `/listing/[id]/edit` | Public | `(public)` | REWRAP | — (individual's classified) |
| `/s/[handle]` | Public | `(public)` | REWRAP | WebShop |
| `/profile/[userId]` | Public | `(public)` | REWRAP | — |
| `/profile/me` | Public | `(public)` | REWRAP | MobileAccount (IA) |
| `/profile/me/listings` | Public | `(public)` | REWRAP | P1MoveListings (IA) |
| `/profile/me/boosts` | Public | `(public)` | REWRAP | — |
| `/profile/me/searches` | Public | `(public)` | REWRAP | — |
| `/favorites` | Public | `(public)` | REWRAP | — |
| `/settings` | Public | `(public)` | REWRAP | MobileAccount (IA) |
| `/create` | Public | `(public)` | REWRAP | MobileSell (IA) |
| `/cart` | Public | `(public)` | REWRAP | BuyCart (IA) |
| `/messages` | Public | `(public)` | REWRAP | MobileMessages (IA) |
| `/purchases` | Public | `(public)` | REWRAP | BuyPurchases (IA) |
| `/purchases/[id]` | Public | `(public)` | REWRAP | BuyOrderTracking (IA) |
| `/purchases/[id]/receipt` | Public | `(public)` | REWRAP | BuyOrderTracking (IA, receipt block) |
| `/purchases/[id]/problem` | Public | `(public)` | REWRAP | BuyDisputeOpen (IA) |
| `/account/returns` | Public | `(public)` | REWRAP | BuyPurchases (IA, pattern) |
| `/account/disputes` | Public | `(public)` | REWRAP | BuyPurchases (IA, pattern) |
| `/returns/[id]` | Public (both actors) | `(public)` buyer surface | **SPLIT** → `+ /seller/returns/[id]` | buyer: — ; seller: WebOrders pattern |
| `/disputes/[id]` | Public (both actors) | `(public)` buyer surface | **SPLIT** → `+ /seller/disputes/[id]` | buyer: BuyDisputeThread (IA); seller: OpsDisputeRespond (IA) |
| `/invite/[token]` | Public | `(public)` | REWRAP | OpsTeamInvite (IA) |
| `/courier` | Public | `(public)` | REWRAP (flagged, Decision 7) | — |
| `/shop/new` | Public | `(public)` | REWRAP | ShopCreate (IA) |
| `/help` `/contact` `/safety` `/privacy` `/terms` `/cookies` | Public | `(public)` | REWRAP ×6 | — |
| `/auth/login` `/register` `/forgot-password` `/reset-password` | Public | `(public)` | REWRAP ×4 | — |
| `/i18n-demo` | Public | `(public)` | REWRAP (flagged for deletion, Decision 8) | — |
| `/checkout` | Public | `(checkout)` | REWRAP | BuyWebCheckout |
| `/checkout/[orderId]/pay` | Public | `(checkout)` | REWRAP | BuyProtectedPay (IA) |
| `/checkout/[orderId]/pending` | Public | `(checkout)` | REWRAP | BuyPayPending (IA) |
| `/checkout/confirmation/[id]` | Public | `(checkout)` | REWRAP | BuyOrderPlaced (IA) |
| `/seller` | Public+SellerShell | `(seller)` | REWRAP | WebSeller |
| `/seller/insights` | Public+SellerShell | `(seller)` | REWRAP | OpsWebAnalytics |
| `/seller/orders` | Public+SellerShell | `(seller)` | REWRAP | WebOrders |
| `/seller/orders/[id]` | Public+SellerShell | `(seller)` | REWRAP | SellerOrder, OpsOrderRefuse (IA) |
| `/seller/returns` | Public+SellerShell | `(seller)` | REWRAP | WebOrders pattern |
| `/seller/disputes` | Public+SellerShell | `(seller)` | REWRAP | OpsDisputeRespond (IA, list) |
| `/seller/catalogue` | Public+SellerShell | `(seller)` | REWRAP | WebCatalog |
| `/seller/catalogue/new` | Public+SellerShell | `(seller)` | REWRAP | P1WebProductNew |
| `/seller/catalogue/[id]` | Public+SellerShell | `(seller)` | REWRAP | WebProduct |
| `/seller/stock` | Public+SellerShell | `(seller)` | REWRAP | WebStock |
| `/seller/stock/inventory` | Public+SellerShell | `(seller)` | REWRAP | P1WebInventory |
| `/seller/messages` | Public+SellerShell | `(seller)` | REWRAP | **OpsShopInbox** (IA) |
| `/seller/billing` | Public+SellerShell | `(seller)` | REWRAP | OpsCommission (IA); OpsWebPayouts (frame) |
| `/seller/billing/[id]` | Public+SellerShell | `(seller)` | REWRAP | OpsCommission (IA) |
| `/seller/payments` | Public+SellerShell | `(seller)` | REWRAP | OpsWebPayouts |
| `/seller/payments/payouts/[id]` | Public+SellerShell | `(seller)` | REWRAP | OpsWebPayouts |
| `/seller/payments/setup` | Public+SellerShell | `(seller)` | REWRAP | OpsPayouts (IA) |
| `/seller/delivery` | Public+SellerShell | `(seller)` | REWRAP | OpsWebDeliveryZones |
| `/seller/delivery/locations` | Public+SellerShell | `(seller)` | REWRAP | OpsWebDeliveryZones (points de retrait) |
| `/seller/delivery/couriers` | Public+SellerShell | `(seller)` | REWRAP | OpsDeliveryZones (IA) |
| `/seller/resale/catalogue` | Public+SellerShell | `(seller)` | REWRAP | WebResale |
| `/seller/resale/links` | Public+SellerShell | `(seller)` | REWRAP | OpsWebResold |
| `/seller/resale/finance` | Public+SellerShell | `(seller)` | REWRAP | OpsWebResold (margins) |
| `/seller/resale/suppliers` | Public+SellerShell | `(seller)` | REWRAP | WebResale ("Mes fournisseurs") |
| `/seller/resale/offered` | Public+SellerShell | `(seller)` | REWRAP | OpsWebResaleEnable |
| `/seller/resale/resellers` | Public+SellerShell | `(seller)` | REWRAP | WebSupplier |
| `/seller/resale/purchase-orders` | Public+SellerShell | `(seller)` | REWRAP | WebSupplier (bons) |
| `/seller/resale/purchase-orders/[id]` | Public+SellerShell | `(seller)` | REWRAP | OpsWebPurchaseOrder |
| `/seller/team` | Public+SellerShell | `(seller)` | REWRAP | OpsWebTeam |
| `/seller/team/activity` | Public+SellerShell | `(seller)` | REWRAP | OpsWebTeam ("Journal complet") |
| `/seller/verification` | Public+SellerShell | `(seller)` | REWRAP | OpsVerifyStart/Status (IA) |
| `/seller/verification/identity` | Public+SellerShell | `(seller)` | REWRAP | OpsVerifyDocument/Selfie (IA) |
| `/seller/verification/identity/return` | Public+SellerShell | `(seller)` | REWRAP | OpsVerifyStatus (IA) |
| `/seller/verification/business` | Public+SellerShell | `(seller)` | REWRAP | SellerVerification (IA) |
| `/seller/settings/orders` | Public+SellerShell | `(seller)` | REWRAP | P1WebShopSettings (tab) |
| `/shop/manage` | Public+SellerShell (own layout copy) | `(seller)` at `/seller/settings` | **MOVE** + 308 | P1WebShopSettings |
| `/moderation/verification` | Public + inline nav | `(ops)` | REWRAP | OpsWebVerifyQueue |
| `/moderation/verification/[id]` | Public + inline nav | `(ops)` | REWRAP | OpsModVerifyReview (IA) |
| `/moderation/disputes` | Public + inline nav | `(ops)` | REWRAP | OpsWebDisputeArbitration (queue) |
| `/moderation/disputes/[id]` | Public + inline nav | `(ops)` | REWRAP | OpsWebDisputeArbitration |
| `/r/[token]` | Bare (hack) | `(bare)` | REWRAP | — (token page; `robots noindex`, `no-referrer` kept) |

New pages created by the splits: `/seller/returns/[id]`, `/seller/disputes/[id]` (both `(seller)`).

**Totals: 79 REWRAP · 1 MOVE · 2 SPLIT.**

## Design

### 1. Shell architecture

Five shells, each a Next.js **route group** so the mechanism is a layout boundary, not a client-side `pathname` check. Route groups do not appear in URLs, so REWRAP changes no URL. `app/layout.tsx` is demoted to the chromeless root: `<html>`, `<body>`, fonts, JSON-LD, and the providers every shell shares (`NextIntlClientProvider`, `QueryProvider`, `AppConfigProvider`, `AuthProvider`, `ChatProvider`). **No visual chrome and no `loading.tsx` at the root** — a root loading boundary is exactly the full-shell swap this spec abolishes. `SiteChrome` is deleted.

| Group | Layout contents | Who |
|---|---|---|
| `(public)` | `Header` + `CategoryBar` + content + `Footer` — today's chrome, moved verbatim from the root layout | visitor, buyer, individual seller of classifieds |
| `(checkout)` | `Header` + slim trust footer; **no category bar, no marketing footer**; breadcrumb "cart / order" per BuyWebCheckout | buyer finishing a purchase |
| `(seller)` | the seller **workspace**: `SellerSidebar` + workspace top bar (shop identity, `ShopSwitcher`, breadcrumbs) + `SuspensionBanner` + content. **No public header, no category bar, no footer.** Canvases: every `Web*`/`OpsWeb*` seller canvas opens with the shop block ("Akwa Tech Store · Espace vendeur"), the sidebar, and the two exits "Voir ma boutique" / "Revenir en mode acheteur" | shop owner, manager, staff |
| `(ops)` | the moderation shell per `OpsWebVerifyQueue`/`OpsWebRiskQueue`: "Modération BuyNSellem · Espace équipe interne" header block, own sidebar (only Vérifications and Litiges entries exist today), the audit notice ("chaque consultation… est inscrite au journal"), moderator identity footer | moderator/admin |
| `(bare)` | the rider token layout, promoted from `app/r/[token]/layout.tsx`: wordmark + `LocaleSwitcher`, nothing else | rider holding an SMS link, no account |

Directory shape (URLs unchanged by the parentheses):

```
app/
  layout.tsx                 # html/body/providers only
  global-error.tsx not-found.tsx
  (public)/   layout.tsx loading.tsx error.tsx  page.tsx search/ listing/ s/ profile/ favorites/ create/ cart/
              messages/ purchases/ account/ returns/[id]/ disputes/[id]/ invite/ courier/ shop/new/ help/ … auth/
  (checkout)/ layout.tsx loading.tsx error.tsx  checkout/…
  (seller)/   layout.tsx loading.tsx error.tsx  seller/…      # layout = today's seller/layout.tsx gate + SellerShell
  (ops)/      layout.tsx loading.tsx error.tsx  moderation/…
  (bare)/     layout.tsx loading.tsx error.tsx  r/[token]/…
```

The `(seller)` group layout keeps the `getMyShop()` gate and `redirect("/shop/new")`; `app/shop/manage/layout.tsx` (the duplicate) is deleted by the MOVE. The `(ops)` layout keeps the `notFound()` gate — the surface's existence stays unadvertised. The `(bare)` layout keeps `robots: noindex` and `referrer: "no-referrer"` — the token is a credential.

**The one URL move.** `/shop/manage` → `/seller/settings` (canvas: P1WebShopSettings is a workspace page under "Paramètres"). Redirect policy: a permanent redirect (308) in `next.config.ts` `redirects()`, query string preserved so `/shop/manage?move=1` keeps working; Next applies `redirects()` before middleware, so the second request hits the `/seller` auth matcher normally. Internal references updated in the same change: `lib/seller-nav.ts:125`, `components/seller/first-run-checklist.tsx:26,43`, `components/seller/catalogue-empty.tsx:21`. The redirect is permanent and never removed — SMS, bookmarks and the mobile app's in-app browser cannot be re-educated. (`packages/mobile` has its own native `/shop/manage` route; it is untouched.)

**The two splits.** `/returns/[id]` and `/disputes/[id]` serve both parties today from the public shell. Each becomes two surfaces over the same data:

- Buyer surface keeps the existing URL in `(public)` — buyers' links, notifications and the `purchases/[id]/problem` redirect keep working.
- Seller surface is new: `/seller/returns/[id]`, `/seller/disputes/[id]` in the workspace, with the seller's actions (respond, propose, accept return) and a `Returns › RET-…` / `Disputes › LIT-…` breadcrumb. The thread/timeline components are extracted and shared; only the frame and the action set differ by actor (the API already scopes what each party may do).
- `seller-returns-client.tsx` and `seller-disputes-client.tsx` repoint their row links to the new seller surfaces. If a seller somehow opens the buyer URL, the page offers a one-line "open in your seller space" link when the viewer is the shop side — a soft bridge, never an automatic bounce, so moderators and edge roles still see something.

### 2. Context persistence: one page = one shell, decided by actor

The rule, stated once and enforced by the directory tree: **a page lives in the shell of the actor whose task it serves.** A "dispute" is not a place; a *buyer's dispute thread* and a *seller's dispute response* are two tasks in two shells over one collection.

Inside the workspace, without ever leaving it: dashboard, insights, orders (+ detail), returns (+ new detail), disputes (+ new detail), catalogue, stock, **shop inbox** (`/seller/messages`, the OpsShopInbox model), resale (all seven pages), delivery, payments, billing, team, activity, verification, shop settings, order settings. In the buyer shell: browsing, cart, checkout handoff, purchases (+ tracking, receipt, problem), buyer returns/disputes lists and threads, personal chat, profile, favorites, classifieds. The moderator never sees either: verification and dispute arbitration render in `(ops)`.

Cross-shell links are **deliberate exits**, and only these exist:

- Workspace → public: sidebar footer "Voir ma boutique" (`/s/[handle]`) and "Revenir en mode acheteur" (`/`), as on every seller canvas. Nothing else in the workspace links into the public shell.
- Public → workspace: the seller-hat entry (§ 5).
- Checkout → public: the "back to cart" breadcrumb and the confirmation page's exits.

The seller sidebar's `messages` entry (`/messages`) is **removed** from `SELLER_NAV` — personal chat is a buyer-hat task reached after "Revenir en mode acheteur". The `inbox` entry remains the one conversation surface inside the workspace.

### 3. Skeleton and loading coherence

- The root has **no** `loading.tsx`. Each group's layout is a server component that persists across child navigations, so by construction the chrome (sidebar, header) never unmounts mid-context; only the content pane suspends.
- `(public)/loading.tsx`: a neutral content skeleton (title bar + card grid) under the real header/category bar. The current home-hero skeleton dies with the root file; the hero is the home page's own business, and a per-page `Suspense` inside `page.tsx` may keep a hero-shaped fallback for `/` alone.
- `(seller)/seller/loading.tsx`: a **content-pane** skeleton — page-title bar, filter row, table rows — rendered beside the live sidebar. The sidebar is in the layout, so it is already on screen; the skeleton must never redraw it. Detail segments that load slowly (`orders/[id]`, `catalogue/[id]`) may add their own nested `loading.tsx` with the same pane-only shape.
- `(ops)`, `(checkout)`, `(bare)`: one pane skeleton each, matching their frame.
- Streaming inside a page uses `<Suspense>` at the section level (e.g. the dashboard's action cards vs its recent-orders table), never a whole-page spinner above the shell.
- `error.tsx` per group, styled inside the shell (the workspace error keeps the sidebar and offers "retry" / "back to dashboard"); the root keeps `global-error.tsx` for layout-level failures. The step-tagged `getMyShop` (`fix(shops)` 389ffeb) keeps naming its failing call in the `(seller)` layout.

### 4. The chat: one system, two surfaces

One conversation system (Payload `conversations`/`messages` + `chat-service` socket), two renderings, chosen by actor:

- **Buyer surface**: `/messages` in `(public)` — the personal thread list, filtered to conversations the user participates in, exactly as today.
- **Seller surface**: `/seller/messages` in the workspace — the shared shop inbox (`InboxClient`: Unassigned / Mine / All filters, assignee picker, order context), the OpsShopInbox canvas. Deep link shape mirrors the buyer one: `/seller/messages?conversation={id}`.

`ChatProvider` stays in the root layout, **above** every group, so switching hats never drops the socket and unread counts stay live in both shells. The routing rule: a conversation link's destination is decided by the **surface emitting it**, never by the conversation. Everything under `(seller)` links to `/seller/messages?...` (the order detail's "reply to buyer", the inbox badge, dashboard "1 message sans réponse"); everything under `(public)` links to `/messages?...` (listing's "message the seller", `purchases/[id]`'s "contact the shop"). A seller answering from the inbox and a buyer reading in their chat see the same thread; neither ever changes shell to do it. Grep-able invariant: no `href` containing `"/messages"` without the `/seller` prefix anywhere under `app/(seller)` or `components/seller`.

### 5. Navigation model

**Sidebar.** The canvases show eleven flat entries; the code has seventeen. Target: the umbrella's hub list as top-level entries, secondary screens demoted to tabs or in-page links so the sidebar matches the canvas height without losing pages:

| Sidebar entry (canvas) | Route | Absorbs |
|---|---|---|
| Dashboard (`Tableau de bord`) | `/seller` | Insights as the "Statistics" tab — OpsWebAnalytics titles itself "Tableau de bord"; `/seller/insights` keeps its URL and renders as that tab (Decision 3) |
| Orders (`Commandes`) | `/seller/orders` | order detail |
| Returns | `/seller/returns` | new return detail |
| Disputes | `/seller/disputes` | new dispute detail |
| Catalogue | `/seller/catalogue` | new/edit product |
| Stock | `/seller/stock` | inventory |
| Resale (`Revente`) / Resellers for level-3 suppliers, per WebSupplier | `/seller/resale/catalogue` | the seven resale pages as the existing sub-tabs |
| Inbox (`Messages`) | `/seller/messages` | — (unread badge kept) |
| Delivery (`Livraison`) | `/seller/delivery` | locations, couriers |
| Payments (`Paiements`) | `/seller/payments` | payouts detail, setup, and **Billing** as the commission tab — OpsWebPayouts covers "soldes, versements et factures de commission"; `/seller/billing*` URLs keep working (Decision 4) |
| Team (`Équipe`) | `/seller/team` | activity via the page's "Journal complet" link, as on OpsWebTeam (drops the `activity` sidebar entry) |
| Verification (`Vérification`, level chip) | `/seller/verification` | identity/business flows |
| Settings (`Paramètres`) | `/seller/settings` (the MOVE) | `/seller/settings/orders` as a tab |

Returns and Disputes as sidebar entries deviate from the canvases (which show neither): the umbrella names them in the hub list and they are live queues with counts; folding them under Orders would hide the two queues the seller is most often late on. Stated deviation, kept.

Permission gating is unchanged: `visibleSellerNav` keeps filtering by `can(role, permission)` and the feature flags (`ordersEnabled`, `protectedPaymentEnabled`, `resaleEnabled`, `deliveryZonesEnabled`); entries that merge keep the strictest existing permission of their absorbed pages on the absorbed tab, not on the whole entry.

**Active states.** Prefix matching as today (`exact` for the dashboard); an absorbed tab lights its parent entry.

**Breadcrumbs.** Inside the workspace only, in the top bar: `Section › reference` for detail pages (`Commandes › BNS-2609-000124`, `Litiges › LIT-…` per OpsWebDisputeArbitration). List pages show no breadcrumb, just the page title block (title + one-line summary + primary actions, the pattern every Web canvas uses).

**Entering the workspace** (the seller-hat switch): the header account menu's "my shop" entry (`shopEntryFor` → `/seller`) remains; proposal is to add a persistent "Espace vendeur" header button when `myShop` exists, since a hat switch hidden in a dropdown is why sellers keep living in the wrong shell (Decision 2). Buyers without a shop keep seeing "open a shop" → `/shop/new` (which stays in `(public)` — it is a buyer *becoming* a seller; the workspace gate redirects there, so it cannot live behind that same gate).

**Leaving it**: only the two sidebar-footer exits (§ 2). The workspace top bar carries no public search box and no category links.

### 6. Migration mechanics

Order of operations, one reviewable move per step:

1. Create the groups; move the chrome out of the root layout into `(public)/layout.tsx`; delete `SiteChrome`; land `(bare)` in the same commit (the rider page depends on the hack being replaced, not just removed).
2. Move the existing directories into their groups — `git mv` only, no URL changes (`79 REWRAP`); promote `seller/layout.tsx` to `(seller)/layout.tsx`; replace `moderation/layout.tsx`'s inline nav with the ops shell.
3. Per-group `loading.tsx` / `error.tsx`; delete root `loading.tsx`.
4. The MOVE: `shop/manage` content → `(seller)/seller/settings/page.tsx`; delete `shop/manage/layout.tsx`; add the 308; repoint the three internal references; `settings/orders` becomes its tab.
5. The SPLITs: extract shared thread/timeline components from `returns/[id]` and `disputes/[id]`; add the two seller surfaces; repoint the two seller list clients.
6. Sidebar regrouping (`seller-nav.ts`): drop `messages`, demote `activity`/`billing`/`insights`/`orderSettings` per § 5; checkout group layout.

Each step keeps `bun run build`, `bun test` and the locale gates green on its own.

## Review focus failure modes

- **Deep link into the moved page.** `/shop/manage` and `/shop/manage?move=1` live in sellers' bookmarks, the first-run checklist of already-rendered pages, and possibly open tabs. The 308 must preserve the query string, and the review must grep the whole repo (`web`, `mobile`, `api` emails/notifications, docs) for `shop/manage` — a notification template or seed pointing at the dead URL passes every type gate.
- **Specs pinned on today's paths.** `lib/*.test.ts` and component tests embed hrefs (`seller-disputes-client` row links, `shop-entry.test.ts`'s literal `"/seller" | "/shop/new"` union, order-actions/system-message fixtures). A path change that only edits the component leaves a test asserting the old URL green against nothing or red against the move; every repointed link needs its test repointed in the same commit, and the en/fr **order-actions and status parity suites** (`order-actions.test.ts`, `order-status.test.ts`, `payment-status.test.ts`, API twins) must not be "fixed" by loosening — they do not name routes, so any failure there means a behavior change leaked in.
- **Locale keys referenced by moved components.** Moving files does not move keys, but the new shells add keys (ops sidebar, breadcrumbs, checkout trust footer, seller-surface titles for the splits) — in `messages/en.json` **and** `fr.json` in lockstep or `messages-parity.test.ts` fails; `messages-keys.test.ts` fails on a key referenced from a moved file but renamed in passing. Namespaces shared with mobile (`Team`, …) must not be renamed — the mobile twin `parity.test.ts` is byte-level.
- **`bun run build` route-group pitfalls.** Two pages resolving to one URL across groups ("parallel pages") — the splits are safe only because the seller surfaces get new URLs; the MOVE is safe only because `shop/manage` is deleted, not copied. One slug name per dynamic path position: the API router already refused to boot on `[orderId]`/`[id]` twins and got `route-slug-consistency.int.spec.ts` (79c17e8); the web tree now grows siblings (`returns/[id]`, `disputes/[id]` in two groups) and needs the twin guard (Testing). Only the root layout renders `<html>/<body>` — a group layout that does breaks the build; a group *missing* a layout silently inherits none of its shell.
- **Auth boundaries when pages change groups.** The middleware matcher is path-based and ignores groups, so REWRAP changes nothing — but the MOVE takes shop settings from `/shop/*` to `/seller/*` (both matched today; verify after) and the SPLITs put seller case detail behind the workspace gate (`getMyShop` + `orders.view`) where the buyer URL only self-gates on `getAuthUser`. Verify: a staff member without `orders.view` gets the sidebar-filtered experience, not a 500; a logged-out hit on each moved/new URL redirects to login with the **new** path in `?redirect=`; `/moderation` under the ops layout still answers `notFound()` to non-moderators, not a styled shell that admits the surface exists.
- **Skeleton regression by omission.** With the root `loading.tsx` deleted, a group that forgets its own gets **no** boundary — hard navigations hang on the previous page instead of swapping shells, which looks like a perf bug and will tempt someone to restore a root skeleton. Every group ships its `loading.tsx` in the same commit that deletes the root one.
- **Chat socket across shells.** If a reviewer "cleans up" by moving `ChatProvider` into `(public)` (its heaviest consumer), the seller inbox loses live updates and the hat switch reconnects the socket. It stays in the root layout.
- **Deploy slice.** The new layouts must import from `packages/api` nothing outside `payload-types`, `src/contracts/`, `src/types/` and the Dockerfile's helper list — `import type` included. `docker-slice-guard.int.spec.ts` and `bun run build` in `packages/web` are the gates; three deploys have died on this before.

## Testing

- **Web unit (`bun test`, ~470 green today).** New pure-module tests beside the code (no component harness exists, so logic lives in `src/lib`): `seller-nav.test.ts` for the regrouped entries (permission × flag matrix, no `/messages` entry, absorbed tabs' gating); a `redirects.test.ts` pinning the `/shop/manage` → `/seller/settings` map including query preservation; breadcrumb builder tests (`Section › ref` from route params).
- **Route-tree guard (new, web twin of `route-slug-consistency.int.spec.ts`).** A `src/lib/app-routes.test.ts` that walks `src/app`, asserts (a) one slug name per dynamic path position, (b) no two `page.tsx` resolve to the same URL across groups, (c) exactly one layout renders `<html>`, (d) every route group directory contains `layout.tsx`, `loading.tsx` and `error.tsx`, (e) no `loading.tsx` at the app root. This pins the shell architecture against the next bolted-on wave.
- **Link-shell invariants.** A test greps the seller surfaces for forbidden exits: no `href` starting `/messages`, `/disputes/`, `/returns/`, `/shop/manage` under `app/(seller)` or `components/seller` (the two sidebar-footer exits are allowlisted).
- **Locale gates.** `messages-parity.test.ts` and `messages-keys.test.ts` stay green with the new keys in both files.
- **Build gates.** `bun run build` in `packages/web` (route groups, slug consistency, slice resolution) and `bun run check-types` at the root; the `as never` ceilings (77 client / 86 api tests) and the advisory baselines must not rise.
- **Manual script (the owner's three complaints, replayed).** (1) Cold-load `/seller/orders`: the workspace skeleton appears with the sidebar, never the home hero. (2) From a seller order, open the buyer conversation and reply: the sidebar never leaves the screen. (3) From `/seller/disputes`, open a case: workspace, breadcrumb, seller actions. Then: `/shop/manage` 308s with query; `/r/{token}` shows only the bare shell; `/moderation/*` as a non-moderator is a 404; checkout shows header + breadcrumb, no category bar; logged-out deep links into five moved/new URLs round-trip through login.

## Decisions for the user

1. **Seller-hat entry gesture.** Keep the account-menu entry only, or add a persistent "Espace vendeur" header button whenever the user has a shop (recommended — the hat switch is currently buried, which is half of why screens leaked into the wrong shell).
2. **`/shop/manage` move.** Recommended: MOVE to `/seller/settings` with a permanent 308 (canvas and umbrella both put settings in the workspace). Alternative: keep the URL and merely rewrap it into `(seller)` — zero link risk, but the settings URL stays the one workspace page outside `/seller/*` forever.
3. **Dashboard vs Insights.** The canvases disagree with the code: OpsWebAnalytics titles the analytics page "Tableau de bord" (tabs "Aujourd'hui / Statistiques"), while the code has `/seller` and `/seller/insights` as two sidebar entries. Recommended: one Dashboard entry, insights as its Statistics tab, URL kept. Say if you want two entries instead.
4. **Billing under Payments.** OpsWebPayouts folds commission invoices into "Paiements"; the code has separate `billing` and `payments` entries (and COD-only shops have billing but no payouts). Recommended: one Payments entry with a Commission tab, both URL families kept; the tab row adapts to what the shop actually has. Confirm, or keep two entries.
5. **Buyer account area.** `/purchases`, `/account/returns`, `/account/disputes` stay at today's URLs in the buyer shell (REWRAP). A later consolidation under `/account/*` is parked — say if you want it in this pass (it would add ~4 MOVEs + redirects).
6. **Checkout focus shell.** BuyWebCheckout keeps the full public header; recommended shell drops only the category bar and marketing footer. Confirm, or keep checkout fully in the public shell.
7. **Courier space** (`/courier`): stays in the public shell this pass. It is arguably its own actor; flag if you want it bare or workspace-adjacent now.
8. **`/i18n-demo`**: a dev page in production routing. Recommended: delete it in step 2.
9. **Category bar on web.** The web canvases show a search-centric header with no persistent category bar (categories are a home section); the app mounts `CategoryBar` on every public page. Keeping it is the recommended default (removing it is re-skinning, out of scope) — flagged because it is a real canvas/code disagreement.

## Verification targets

Measured on a quiet tree at the end of the pass:

- `bun run build` in `packages/web` passes; `bun run check-types` at the root passes; `docker-slice-guard.int.spec.ts` green.
- `find packages/web/src/app -maxdepth 1 -name "page.tsx" -o -maxdepth 1 -name "loading.tsx"` → nothing: every page lives in one of the five groups, and the root has no loading boundary.
- Five groups exist, each with `layout.tsx`, `loading.tsx`, `error.tsx`; `site-chrome.tsx` is deleted; `grep -rn "SiteChrome" packages/web/src` → nothing.
- Route inventory diff against the 82 pages in this spec's table: every URL answers as before except `/shop/manage*` (308 to `/seller/settings*`), plus the two new seller case URLs. No other URL changed.
- `grep -rn '"/messages' packages/web/src/app/\(seller\) packages/web/src/components/seller` → nothing (inbox links are `/seller/messages`); `grep` for `/disputes/` and `/returns/` under the seller tree finds only `/seller/`-prefixed hrefs.
- `bun test` in `packages/web` green (count may grow, zero failures); `messages-parity` and `messages-keys` green; mobile untouched (`git status` clean under `packages/mobile`).
- Cast and error ceilings unchanged: 77 client `as never`, 86 api-test `as never`, 100 `check-types:tests` errors, 35 mobile advisory — measured with the exact commands in `AGENTS.md`.
- The manual script in Testing executed once by the owner — the three complaints are the acceptance test.
