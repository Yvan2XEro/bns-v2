# Listing kinds and shop profiles — October 2026

BuyNSellem began as a marketplace for things. It now carries flats to rent,
job offers and services, but most of the app still treats every ad as a thing
for sale and every business as a shop with stock. This document records what
that costs, what we decided, and the order of the work.

## 1. What exists today

- **Categories already know their kind.** `categories.listingForm.type`
  (`product`, `service`, `job`, `rental`, `generic`), inherited down the tree
  and resolved by `api/src/lib/listingFormPreset.ts`, is exposed to clients as
  `listingType` / `formPreset`. It only decides whether the ad form asks for a
  price and photos, and the title placeholder.
- **Listings have two modes:**
  - a *classified* (no product): the buyer messages or calls;
  - a *shop product* (`listing.product`): buy box, cart, orders, delivery.
  The page picks the mode from `productId` alone, whatever the category.
- **Shops are all retail.** Every shop gets the catalogue, stock, orders,
  returns, disputes, delivery and resale workspace, and its public page counts
  "products" and shows delivery cities.

## 2. What goes wrong

| Where | Today | Example |
| --- | --- | --- |
| Catalogue | Any category can become a product with stock, variants and a cart | A job offer "in stock: 3", added to the cart |
| Ad page | The only actions are *message* or *call*, worded for a seller | "Contact the seller" on a job; nothing to ask for a visit |
| Price | A bare number | A rent of 150 000 reads like a sale price; a salary like a price tag |
| Missing price | "Price on request" everywhere | A job without a salary, a service on quote |
| Safety tips | Written for buying goods | Nothing on rental deposit scams or "pay to apply" job scams |
| Closing an ad | "Mark as sold" | A flat is *let*, a position *filled* |
| Search engines | Every ad is a `Product` | Job offers miss Google for Jobs (`JobPosting`) |
| Shop | "Boutique", products, delivery, stock, orders | An estate agency or a recruiter sees a retail back-office it cannot use, and has no page to manage its ads |

## 3. Decisions

### 3.1 The kind belongs to the listing

- `listings.kind` is **stored**, set from the category on every write (never by
  the client), indexed, and backfilled once at deploy. Cards, search and the
  page read it without populating the category tree.
- The five kinds stay; no data migration of categories. In the admin,
  `rental` is labelled *Property & rentals*: the real-estate tree also holds
  sales, told apart by the price unit (below).

### 3.2 One capability table, shared

`api/src/contracts/listingKinds.ts` is the only place that knows what a kind
allows; the API, web and mobile import it.

| Kind | Main action | Price units (first = default) | Can be a shop product | Closed as |
| --- | --- | --- | --- | --- |
| product | order (shop product) or contact | total | yes | sold |
| rental | request a visit | month, week, day, night, total | no | let |
| job | apply | month, day, hour | no | filled |
| service | request a quote | total, hour, day, month | no | done |
| generic | contact | total | no | done |

### 3.3 Price unit

- `listings.priceUnit` is optional (empty = `total`). The API refuses a unit
  the kind does not allow.
- The price shows with its unit: "150 000 FCFA / month". A rental sold
  outright uses `total`.
- When there is no price, the fallback depends on the kind:
  - job: "Salary not stated";
  - service: "On quote";
  - other kinds: "Price on request".

### 3.4 Actions on the ad page

- **Main action:** *Request a visit* (rental), *Apply* (job) or *Request a
  quote* (service). Each opens the conversation with the seller and drafts a
  message the buyer can edit before sending, so nothing is sent on their
  behalf.
  - Phone and WhatsApp stay available.
  - The sticky mobile bar uses the same wording.
- **Safety tips and structured data** follow the kind:
  - rental: never pay a deposit before visiting and signing;
  - job: never pay to apply, keep identity documents for the hiring stage;
  - service: agree the price and scope before work starts;
  - structured data: `JobPosting`, `Service`, `Offer` of an `Accommodation`,
    and `Product` only for products.
- **"Mark as sold"** becomes *Mark as let*, *Position filled* or *Mark as
  done* depending on the kind. The stored status stays `sold`.

### 3.5 Shop profiles

`shops.profile` describes the kind of business:
- `store`: a shop;
- `agency`: an estate or rental agency;
- `employer`: a recruiter or employer;
- `provider`: a service provider.

Existing shops are `store`.

**Store.** Keeps the full retail workspace.

**Agency, employer and provider:**
- **Workspace.** They lose the retail entries: catalogue, stock, orders,
  returns, disputes, delivery and resale. They gain **Listings**, a page of the
  shop's ads with filters and the close, renew and edit actions.
  - Payments, team, verification, messages and settings are unchanged.
- **Public page.** It says *Agency*, *Recruiter* or *Provider* and counts
  "properties", "job offers" or "services". It hides delivery cities and pickup
  points, and its contact button is worded for the profile.

**Every profile:**
- **New ads.** "New listing" in the workspace opens the ad form with the shop
  preselected. Only a `store` also gets "New product".
- **Changing profile.** The profile can be changed in settings. Leaving
  `store` is refused while the shop has active products, so no order flow is
  stranded.

**Where the profile is chosen.** At shop creation, with four cards (icon,
one-line description, what changes). It defaults to `store`.

### 3.6 The catalogue only sells goods

Creating or moving a product into a category whose kind is not `product` is
refused (`catalogue.categoryNotSellable`), and the product editor's category
picker only offers product categories. Existing products in such categories
keep working; the seller sees why they cannot be edited into a new one.

## 4. Lots

1. **API foundation:**
   - the contract;
   - `listings.kind` and `listings.priceUnit`, with validation;
   - `shops.profile`, with the change guard;
   - the catalogue guard;
   - the search indexer carries `kind` and `priceUnit`;
   - the deploy backfill;
   - generated types and tests.
2. **Web ad page and forms:**
   - actions and drafts;
   - price unit, fallbacks and safety tips;
   - JSON-LD;
   - close labels;
   - the unit on cards;
   - the unit picker in the create and edit forms.
3. **Web shops:**
   - the profile at creation and in settings;
   - the public page;
   - workspace navigation and the Listings page;
   - the product editor's category filter.
4. **Mobile parity** for lots 2 and 3.

Each lot ships on its own and is committed and pushed when it passes
type-checking and tests.

## 5. Later

These are deliberately left out of this round:
- an application form with a CV upload;
- visit scheduling with slots;
- per-profile shop levels and pricing;
- search tabs by kind on the home page.
