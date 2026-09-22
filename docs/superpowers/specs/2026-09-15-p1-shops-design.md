# P1 Shops Design

Date: 2026-09-15
Parent: `2026-09-15-business-layer-design.md`
Depends on: `2026-09-15-p0-foundations-design.md`

## Goal

Let a user with a verified phone open a branded shop, manage a catalogue of products with variants and stock, publish them on the shop's public page and shareable link, and have them found in search — without any money flowing through the platform. A seller gets a storefront they can share on WhatsApp and Facebook; buyers get an identifiable shop instead of an anonymous profile.

## Scope

1. `shops` and `shop-members` collections, with owner membership only.
2. Shop creation and management, gated by a verified phone (level 1).
3. Products with variants, stock and an append-only stock ledger. Each active product publishes one listing in its shop, and existing classified listings can be moved in as products.
4. Public shop page at `/s/{handle}` on web and mobile, with sharing.
5. Shop search index, shop filter on listing search, shop fields on listing documents.
6. Reports against shops; moderation can suspend and unsuspend shops.
7. Notifications for shop creation and suspension.
8. A feature flag so shops can ship dark.

## Out of scope

- Team members, invites, shared inbox (P3). The `shop-members` roles enum exists but only `owner` rows are created.
- Verification levels 2 and 3, badges beyond level 1, verification documents (P2).
- Orders, cart, and stock reservations tied to orders (P4). Stock in P1 changes only through manual movements.
- Resale settings on products and reselling another shop's product (P8).
- Shop reviews: shops show the owner's user rating until verified-purchase reviews exist (P4).
- Following a shop, shop analytics (P9).
- The buyer/seller "two hats" navigation (its own IA project). P1 adds entries to the existing navigation.
- Universal links and Android App Links for `/s/{handle}`: the app has no associated domains configured today. Tracked as a follow-up.

## Design

### Data model

#### `shops`

| Field | Type | Rules |
|---|---|---|
| `handle` | text, unique, indexed | lowercase, 3–30 characters, `^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`, no double hyphen, not reserved |
| `previousHandles` | array `{ handle, until }` | kept 90 days after a change; resolves to the shop for redirects |
| `handleChangedAt` | date | a handle can change once every 30 days |
| `name` | text, required | 2–60 characters |
| `description` | textarea | up to 1,000 characters |
| `logo` | upload media | optional |
| `banner` | upload media | optional |
| `contact` | group | `phone` (public business number, optional), `whatsapp` (optional), `email` (optional) |
| `location` | group | `city`, `region`, `country`, `countryCode`, same shape as `users.homeLocation`, no coordinates |
| `categories` | relationship categories, hasMany | up to 5, used for shop search |
| `owner` | relationship users, required | set at creation, read-only afterwards |
| `status` | select `active`, `suspended`, `closed` | service-written only |
| `level` | number 0–3 | service-written only; set to 1 at creation; P2 manages it |
| `suspendedAt`, `suspendedUntil`, `suspendedReason`, `suspendedNote`, `suspendedBy` | same as users | service-written only |
| `publishedListingCount` | number | maintained by a listings hook |

Reserved handles: `admin`, `api`, `app`, `auth`, `buynsellem`, `bns`, `boutique`, `boutiques`, `contact`, `help`, `login`, `moderation`, `new`, `privacy`, `register`, `s`, `search`, `settings`, `shop`, `shops`, `store`, `support`, `terms`, `verify`, plus every existing top-level route segment of the web app.

Access:

- **read:** anyone, restricted to `status = active`. Owner and staff read every status.
- **create:** closed to REST. Creation goes through `POST /api/shops`.
- **update:** active shop members with role `owner` or `manager`. Service-owned fields (`owner`, `status`, `level`, suspension, counts, `handleChangedAt`, `previousHandles`) are pinned in `beforeChange` unless `req.context.shopService === true`.
- **delete:** closed. Shops are closed, never deleted, so reports and moderation history keep their target.

#### `shop-members`

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, required | |
| `user` | relationship users, required | |
| `role` | select `owner`, `manager`, `staff` | P1 creates `owner` only |
| `status` | select `active`, `revoked` | |
| `createdAt` | date | |

Unique compound index on `(shop, user)`. Read by the member themselves and staff. Writes are service-only.

New helper `access/shopRoles.ts`:

- `resolveShopRole(payload, userId, shopId)` returns the active role or `null`, cached per request in `req.context`.
- `canManageShop(role)` is true for `owner` and `manager`.

#### `products`

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, required, indexed | set at creation |
| `title` | text, required | 3–120 characters |
| `description` | textarea | up to 5,000 characters |
| `category` | relationship categories, required | its form preset and attributes apply, as for listings |
| `attributes` | json | validated against the category, like `listings.attributes` |
| `images` | array of media | up to 10 |
| `status` | select `draft`, `active`, `archived` | only `active` products are published |
| `options` | array `{ name, values[] }` | up to 3 options, e.g. Couleur × Stockage |
| `delivery` | group | `handlingHours`, `weightGrams`, `codAllowed`, `pickupAllowed` |
| `returnPolicy` | textarea | shown on the listing |
| `listing` | relationship listings | the published listing, service-written |

#### `product-variants`

| Field | Type | Rules |
|---|---|---|
| `product` | relationship products, required, indexed | |
| `optionValues` | json | one value per product option; empty for the default variant |
| `sku` | text | unique per shop |
| `price` | number, integer | XAF |
| `cost` | number, integer | purchase cost; readable by shop members only |
| `trackInventory` | checkbox | default true |
| `stockOnHand` | number | cache of the ledger; service-written only |
| `stockReserved` | number | cache of the ledger; always 0 in P1 |
| `lowStockThreshold` | number | alert when `stockOnHand - stockReserved <= threshold` |

#### `stock-movements`

Append-only: `create`, `update` and `delete` are closed to requests, and only `services/stock.ts` writes it.

| Field | Type | Rules |
|---|---|---|
| `variant` | relationship product-variants, required, indexed | |
| `type` | select `receipt`, `adjustment`, `loss`, `return`, `sale`, `reservation`, `release` | P1 writes only the first four |
| `quantity` | number, integer, non-zero | signed |
| `unitCost` | number | for receipts |
| `stockAfter` | number | `stockOnHand` after the movement |
| `note` | text | |
| `actor` | relationship users | |
| `orderRef` | text | set from P4 |

Each movement and its variant cache update happen in one transaction, with a conditional update that refuses to take `stockOnHand` below zero.

#### `listings`

- New field `shop`: optional relationship to `shops`, indexed.
- New field `product`: optional relationship to `products`, indexed. When set:
  - title, description, images, price range and availability are derived from the product by the product service and pinned against direct writes;
  - the listing does not expire and is not limited to three images.
- In `beforeChange`, when `shop` is set or changed:
  - the caller must be an active member of that shop (`owner`, `manager` or `staff`);
  - the shop must be `active`;
  - `seller` stays the current user, as today.
- Staff moderation writes (`req.context.moderationAction`) skip the membership check.

#### `users`

- New virtual field `phoneVerified` (checkbox): `Boolean(phoneVerifiedAt)`. Readable by the user themselves and staff, so clients can show the shop gate without exposing the verification fields.

### Services and routes

`services/shops.ts` owns every write to service-owned fields and uses a Payload transaction for multi-document writes (available since P0).

#### Create a shop: `POST /api/shops`

Body: `handle`, `name`, optional `description`, `city` and `categories`.

1. **Caller eligibility**:
   - the caller is authenticated;
   - the caller is not suspended;
   - `phoneVerifiedAt` is set, otherwise `shop.phoneNotVerified`.
2. **Shop limit**: the caller owns fewer than `MAX_SHOPS_PER_USER` shops (1 in P1), otherwise `shop.limitReached`.
3. **Handle checks**: validate and normalise the handle. An invalid, reserved or taken handle, including an active `previousHandles` entry, returns `shop.handleInvalid`, `shop.handleReserved` or `shop.handleTaken`.
4. **Write**: in one transaction, create the shop with `status: active` and `level: 1`, then create the owner membership.
5. **After write**: publish `shop.created` and trigger the `shop-created` notification.

#### Check a handle: `GET /api/public/shops/handle-available?handle=`

Returns `{ available, reason }` for live validation in the creation form. Rate limited per IP.

#### Update a shop

Payload REST `PATCH /api/shops/{id}` for editable fields (name, description, logo, banner, contact, location, categories).

Handle changes go through `POST /api/shops/{id}/handle`:

1. Enforce the 30-day cooldown (`shop.handleCooldown`) and the handle rules.
2. Push the old handle into `previousHandles` with `until = now + 90 days`.
3. Publish `shop.updated`.

#### Public shop lookup: `GET /api/public/shops/{handle}`

- Resolves the current handle first, then an unexpired `previousHandles` entry. The latter returns `{ redirectTo: currentHandle }`.
- Returns the shop's public fields, the owner's public profile (name, avatar, rating, total reviews, member since), `publishedListingCount` and the level.
- Suspended or closed shops return 404 to the public.
- The shop's listings are fetched through the existing search route with the new `shop` filter.

#### Move listings into a shop: `POST /api/shops/{id}/listings/attach`

- Body: `listingIds`, or `all: true` for every listing whose `seller` is the caller.
- Only listings owned by the caller. Each one becomes a product with a single default variant whose stock is not tracked until the seller sets it. The listing keeps its id, status, favourites and conversations, and is re-indexed.
- `POST /api/shops/{id}/listings/detach` does the reverse.

#### Close a shop: `POST /api/shops/{id}/close`

- Owner only. Requires the confirmation string `handle`.
- Sets `status: closed` and detaches every listing (`shop: null`). Listings remain the owner's classified ads.
- The handle is reserved for 90 days, then released.
- Publishes `shop.updated`.

#### Products and stock

`services/products.ts` and `services/stock.ts` own every write to products, variants, movements and product-backed listings.

- **Create or update a product:**
  - `POST /api/shops/{id}/products`, and `PATCH /api/products/{id}` with its variants.
  - Caller must be an active member; editing costs requires `owner` or `manager`.
  - When the status becomes `active`, the service creates or updates the listing in the same transaction and publishes `listing.updated`. Archiving a product unpublishes the listing.
  - Changing a variant's options never deletes its movements. A removed variant is archived.
- **Record a movement:** `POST /api/variants/{id}/stock-movements`.
  - Body: `type` (`receipt`, `adjustment`, `loss`, `return`), `quantity`, optional `unitCost` and `note`.
  - A movement that would take stock below zero returns 409 `stock.negative`.
  - Crossing the low-stock threshold triggers the `stock-low` notification to shop owners and managers.
- **Stock history:** `GET /api/shops/{id}/stock-movements?variant=&type=&from=`, paginated.
- **Stock summary:** `GET /api/shops/{id}/stock-summary`.
  - Returns cost value, units on hand, units reserved, and low-stock and out-of-stock variants.
  - Readable by `owner` and `manager` only, because it exposes costs.
- **Bulk import:** out of scope for P1. The web catalogue shows the entry point disabled with "Bientôt".

### Moderation

`ModerationLog`:

- `targetType` gains `shop`.
- `MODERATION_ACTIONS` gains `shop.suspend` and `shop.unsuspend`.

`services/moderation.ts`:

- `suspendShop(actor, shopId, { reason, durationDays, note })`:
  - same rank and duration rules as users;
  - the rank compared is the shop owner's role;
  - in one transaction:
    - take the shop's published listings down to `draft`, recording their ids in the log metadata;
    - set `status: suspended` and the suspension fields.
- `unsuspendShop(actor, shopId, { note, restoreListings })` mirrors `unsuspendUser`: it restores listings still in `draft` from the last `shop.suspend` entry.
- `suspendUser` also suspends every active shop the user owns, in the same transaction, and records their ids in its metadata. `unsuspendUser` unsuspends only the shops that this suspension had suspended.

A suspended shop's owner still sees the shop in their management screens, with the suspension banner and reason. Members cannot attach listings to it.

Moderation route: `POST /api/moderation/shops/{id}` with `action: suspend | unsuspend`, plus `GET` for a shop sheet (identity, owner, counts, reports against the shop, history). This follows the existing users route.

Reports: `targetType` gains `shop`. The mobile `report` screen already accepts `targetType` as a parameter, and web gets the same entry on the shop page.

Mobile moderation: a report on a shop opens a new `moderation/shop/[id]` screen, built on `ModerationScreen`, `DecisionSheet` and the account sheet layout.

### Search

**Listing documents** (`search-indexer` `transformListing`) gain four fields:
- `shopId`, filterable.
- `shopHandle`, stored.
- `shopName`, searchable.
- `shopLevel`, filterable.

The indexer already fetches listings at `depth=2`, so the shop comes populated.

**New Meilisearch index `shops`**:

| Setting | Attributes |
|---|---|
| Searchable | `name`, `handle`, `description`, `city` |
| Filterable | `city`, `countryCode`, `categoryIds`, `level` |
| Sortable | `publishedListingCount`, `createdAt` |

Only active shops are indexed.

**Events**, on the existing `search:index` Redis channel:
- `shop.created`, `shop.updated` and `shop.deleted` are added to `publishSearchEvent`.
- On `shop.updated`, the indexer re-indexes the shop document. It also re-indexes the shop's listings when `name`, `handle`, `status` or `level` changed, reading them by `shop` filter from Payload in pages of 100.
- Suspension and closure remove the shop from the `shops` index.

**Public routes:**
- `GET /api/public/search` accepts `shop={shopId}`.
- New `GET /api/public/search/shops?q=&city=&category=` queries the `shops` index, with every filter value passed through `quoteFilterValue`.

### Web

**New routes:**
- `/s/[handle]`, server-rendered:
  - banner, logo, name, city, description;
  - owner card with rating and member-since date;
  - level-1 badge ("Phone verified");
  - business contact buttons (WhatsApp, call), each shown only if set;
  - share button copying `https://buynsellem.com/s/{handle}`;
  - listing grid with the existing listing card;
  - "Report shop".
  - Metadata: title, description, OpenGraph image (banner, then logo), JSON-LD `Store`. A previous handle returns a 308 redirect to the current one; an unknown handle returns the existing not-found page.
- `/shop/new`, the creation form:
  - live handle availability;
  - if the phone is not verified, a gate linking to the existing phone verification in settings, returning to `/shop/new` afterwards.
- `/shop/manage`: shop settings (profile, branding, contact, location, categories), handle change with its cooldown, "Move my listings to my shop", close shop.
- `/seller/catalogue`: the product table.
  - Filters: status, low stock, out of stock.
  - Columns: price range, available stock, status and published-listing link.
- `/seller/catalogue/[id]`: the product editor.
  - Information and attributes, photos.
  - Options and a variants table: SKU, price, cost, margin, stock on hand, low-stock threshold.
  - Publication card and latest movements.
- `/seller/stock`: stock tracking.
  - Summary: cost value, units, alerts.
  - Movements table with type filters.
  - "Adjust stock" drawer: receipt, correction, loss or damage, return.
- The seller space uses a persistent sidebar: Dashboard, Orders (P4), Catalogue, Stock, Resale (P8), Messages, Delivery (P7), Payments (P5), Team (P3), Verification (P2), Settings. Entries for later phases are hidden until their phase ships.

**Changes to existing screens:**
- **Listing detail:** when `listing.shop` is set, the seller card shows the shop (logo, name, level) and links to `/s/{handle}`, with the owner's name as secondary text.
- **Listing create and edit:** for a shop member, "Publish in {shop name}" (default on for new listings).
- **`profile/me`:** a "My shop" entry, or "Open a shop" when the user has none.
- **Search:** a "Shops" tab using the shops search route.

### Mobile

**New routes**, registered in `app/_layout.tsx` with `headerShown: false`:
- `app/s/[handle].tsx`: the public shop page, with the same content as web. Sharing uses React Native `Share` with the web URL.
- `app/shop/create.tsx`: the creation form with live handle availability, and the phone gate linking to `security`.
- `app/shop/manage.tsx`: settings, handle change, attach listings, close shop.
- `app/seller/index.tsx`: the Shop hub, with tiles to every management area.
- `app/seller/catalogue.tsx`: product list with stock chips, and a quick stock stepper for single-variant products.
- `app/seller/product/[id].tsx`: product editor with variants and per-variant stock.
- `app/seller/stock-adjust.tsx`: the adjustment sheet (type, quantity, unit cost, note, stock after).
- `app/moderation/shop/[id].tsx`: the moderation sheet.

**Changes to existing screens:**
- **Account tab:** a "My shop" section showing the shop name and level, or an "Open a shop" entry.
- **Listing detail seller card:** shows the shop when present and opens `s/[handle]`.
- **Create flow and listing edit:** the "Publish in {shop name}" toggle for members.
- **Search:** a "Shops" segment.
- **Deep link:** `buynsellem://s/{handle}` resolves through expo-router.

### Feature flag

`AppSettings` gains `shops.enabled` (default `false`) and `shops.maxPerUser` (default `1`).
- `GET /api/public/config` exposes `shopsEnabled`.
- When disabled:
  - shop creation returns 403 `shop.disabled`;
  - clients hide every shop entry point;
  - shop pages and the shops search still resolve, so links shared during a staged rollout keep working.

### Notifications

New Novu workflows in `syncNotificationWorkflows.ts`:

| Workflow | Recipient | Trigger |
|---|---|---|
| `shop-created` | owner | shop created: welcome message and link to share |
| `shop-suspended` | owner | shop suspended: reason and end date |
| `shop-unsuspended` | owner | suspension lifted |

### Error codes

Added to `lib/errors.ts`, with fallbacks and translations in both clients:
- `shop.disabled`
- `shop.phoneNotVerified`
- `shop.limitReached`
- `shop.handleInvalid`, `shop.handleReserved`, `shop.handleTaken`, `shop.handleCooldown`
- `shop.notMember`
- `shop.inactive`
- `shop.notFound`

### Internationalisation

Every new string is added in English and French on web (next-intl) and mobile (i18next) in the same change. Shop content (name, description) is user-written in a single language, like listings. Bilingual obligations apply to order documents and terms in P4.

## Testing

**Unit tests:**
- Handle validation and normalisation: reserved words, length, hyphens, case.
- Handle cooldown and `previousHandles` expiry.
- `resolveShopRole` and the listing membership rule: member, non-member, inactive shop, moderation bypass.
- Shop creation gate: unverified phone, suspended user, limit reached.
- Moderation, reusing the in-memory Payload fake from the moderation tests:
  - `suspendShop` and `unsuspendShop` cascade and restore;
  - `suspendUser` cascading to owned shops;
  - the rank rule through the owner.
- Indexer: `transformListing` with and without a shop, and the shop document transform.
- Stock ledger:
  - a movement and its cache update commit together or not at all;
  - a negative result is refused;
  - concurrent adjustments on the same variant do not lose an update;
  - the low-stock notification fires once per crossing.
- Product publication:
  - activating a product creates exactly one listing;
  - editing the product updates it;
  - archiving unpublishes it;
  - direct writes to derived listing fields are ignored.

**Route tests:**
- Shop creation.
- Handle availability.
- Public lookup, including the redirect from a previous handle and 404 for suspended and closed shops.
- Attach and detach restricted to the caller's own listings.
- Close.
- Moderation shops route, including a moderator against a shop owned by another moderator (403).

**Clients:**
- Typecheck and biome on web and mobile.
- Manual pass on both:
  - create a shop with and without a verified phone;
  - publish into the shop;
  - share link opens the page;
  - change the handle and open the old link;
  - suspend from mobile moderation and confirm the page 404s and the listings leave search;
  - unsuspend and confirm restoration.

## Verification targets

- `bun run generate:types` in `packages/api`
- `bun run check-types` in `packages/api`, `packages/web`, `packages/mobile`, `packages/search-indexer`
- `bunx vitest run --config ./vitest.config.mts` in `packages/api`
- `bun test` in `packages/mobile` and `packages/search-indexer`
- `bunx biome check` on touched files
- Staging with `shops.enabled = true`: the manual pass above, then production with the flag off, then on.
