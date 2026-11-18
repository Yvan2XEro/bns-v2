# Web UX Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One coherent shell architecture for `packages/web`: five Next.js route groups — `(public)`, `(checkout)`, `(seller)`, `(ops)`, `(bare)` — each with its own layout, loading skeleton and error boundary, every page living in the shell of the **actor** whose task it serves. The owner's three complaints die by construction: a cold load of `/seller/orders` paints a workspace skeleton beside the live sidebar, never the home hero; a seller answers the shop inbox without the sidebar ever leaving the screen; a seller opens a dispute or return case inside the workspace with a breadcrumb and seller actions, never in the buyer chrome. URLs do not move except one MOVE (`/shop/manage` → `/seller/settings`, permanent 308, query preserved), two SPLITs (new `/seller/returns/[id]` and `/seller/disputes/[id]` over the same data, buyer URLs untouched) and one deletion (`/i18n-demo`).

**Architecture: route groups, not pathname checks.** Route groups do not appear in URLs, so the 79 REWRAPs change no URL — the mechanism is a layout boundary, and the risk is entirely in the moved *files*: imports, co-located tests, locale keys, and the per-shell layout/loading/error trio. `app/layout.tsx` is demoted to the chromeless root (`<html>`, `<body>`, fonts, JSON-LD, and the providers every shell shares — `NextIntlClientProvider`, `QueryProvider`, `AppConfigProvider`, `AuthProvider`, **`ChatProvider`**, which must stay above every group so a hat switch never drops the chat socket). `SiteChrome`, the client-side `pathname.startsWith("/r/")` hack, is deleted. **No `loading.tsx` survives at the root** — a root loading boundary is exactly the full-shell swap this plan abolishes. Web only: `packages/api` and `packages/mobile` are untouched; if any task turns out to need an API change, it is a **conflict to flag, not work to do** (see Global Constraints).

**Tech Stack:** Next.js 16 App Router + next-intl `{x}` + Tailwind + Radix (`packages/web`, tests `bun test`, ~470 green today). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-10-web-ux-alignment-design.md` — binding for the page→shell table (82 rows), the shell anatomies, the chat two-surfaces rule, the sidebar regroup, and the review-focus failure modes. Its nine "Decisions for the user" are all resolved here to **the recommended option**; the user may still veto any of them, so each decision's implementation is isolated in its own task or its own named step for a cheap revert:

| Decision | Resolution implemented | Where (isolated) |
|---|---|---|
| 1 — seller-hat entry | persistent "Espace vendeur" header button when `myShop` exists | Task 9 (whole task) |
| 2 — `/shop/manage` | MOVE to `/seller/settings`, permanent 308, query preserved | Task 10 (whole task) |
| 3 — Dashboard vs Insights | one Dashboard entry; insights = its Statistics tab, URL kept | Task 5, Step 4 |
| 4 — Billing under Payments | one Payments entry with the Commission tab; both URL families kept | Task 5, Steps 5–6 |
| 5 — buyer account area | stays at today's URLs (plain REWRAP, no moves) | Task 1 (nothing extra) |
| 6 — checkout shell | header + breadcrumb + slim trust footer; no category bar, no marketing footer | Task 2 (whole task) |
| 7 — courier space | stays `(public)` this pass | Task 1 (nothing extra) |
| 8 — `/i18n-demo` | deleted | Task 10, Step 6 |
| 9 — category bar | kept on every `(public)` page (chrome moved verbatim) | Task 1 (nothing extra) |

## Global Constraints

Copied from the spec and `AGENTS.md`; every task's requirements implicitly include this section.

- **Web only, strictly.** Every file this plan touches is under `packages/web` (plus this plan file). `packages/api` is untouched — the new seller surfaces consume the **existing** hooks and contracts (`useDispute`, the returns hooks, `src/contracts/returns` re-exports); `packages/mobile` is untouched (`git status` must stay clean there, including the shared `/r/[token]` convention). If a task appears to need a new API type, helper or endpoint, **stop and flag it as a conflict in the task report** — do not add it, not even under `src/contracts/`.
- **URLs are immutable** except: `/shop/manage*` → `/seller/settings*` (308, Task 10), `+/seller/returns/[id]`, `+/seller/disputes/[id]` (Tasks 6–7), `−/i18n-demo` (Task 10). A route group directory never appears in a URL; any other URL change is a defect.
- **The deploy slice.** The new layouts and pages import from `packages/api` nothing outside `payload-types`, `src/contracts/`, `src/types/` and the Dockerfile's helper list — `import type` included, because the image's `next build` must *resolve* it. `tests/int/docker-slice-guard.int.spec.ts` (run read-only from `packages/api`) and `bun run build` in `packages/web` are the gates; three deploys have died on this before.
- **Every task leaves a shippable tree.** `cd packages/web && bun run build && bun test` green at the end of every task, plus the locale gates (`messages-parity.test.ts`, `messages-keys.test.ts`). The two transiently-degraded states are named where they happen (Task 1's step notes): never a broken page, only a missing header for one wave.
- **Moves are `git mv`,** so review diffs show renames, not deletions. `~/` alias imports survive moves; relative imports move with their directory — each move step ends with `bun run build` to catch the exceptions.
- **Pin edits are deliberate.** Every test that embeds a path this plan changes is edited **in the same commit** as the component, with a comment citing the spec section or decision that ruled it. The en/fr **order-actions / order-status / payment-status parity suites are never touched** — they name no routes, so any red there is a leaked behavior change, and "fixing" them by loosening is the named failure mode (Review Focus 5).
- **Locale keys in lockstep.** New keys (`Checkout.shell.*`, `Moderation.shell.*`, `Seller.tabs.*`, `Returns.openInWorkspace`, `Disputes.openInWorkspace`, error/loading copy) land in `messages/en.json` **and** `messages/fr.json` in the same commit. Namespaces shared with mobile (`Team`, …) are never renamed — the mobile `parity.test.ts` twin is byte-level. Deleting the `Demo` namespace and `Seller.nav.messages` happens in both files at once.
- **Ceilings (AGENTS.md), measured with the published commands on a quiet tree:** client `as never` ≤ **77** (`grep -ro 'as never' packages/web/src packages/mobile/src packages/mobile/app | wc -l`), api-test casts 86, `check-types:tests` 100, mobile advisory 35. This plan adds zero casts; mobile and api numbers cannot move because those trees are untouched.
- **`ChatProvider` stays in the root layout** — above every group, so switching hats never reconnects the socket and unread counts stay live in both shells (pinned by Task 11).
- **Gates keep their shape.** The `(seller)` layout keeps the `getMyShop()` gate and `redirect("/shop/new")`, with the step-tagged `getMyShop` (389ebbf's `fix(shops)`) still naming its failing call. The `(ops)` layout keeps `notFound()` — the surface stays unadvertised. The `(bare)` layout keeps `robots: noindex` + `referrer: "no-referrer"` — the rider token is a credential. `src/middleware.ts` is not edited: its matchers are path-based and every protected path keeps its prefix.
- **Commits one line, no attribution trailers** (the hook strips and fails them; never `--no-verify`). Docs in English; comments sparse — only non-obvious reasons.

## Review Focus

The six failure modes the spec names that no single task's happy path would otherwise exercise, most likely first. Each line's pinning test is assigned to the owning task.

1. **Deep links into the moved page.** `/shop/manage` and `/shop/manage?move=1` live in bookmarks, the first-run checklist, and open tabs. The 308 must preserve the query string, and a reference anywhere in the repo (mobile's native route excepted — it is its own screen) passes every type gate while pointing at a dead URL. → Task 10's `redirects.test.ts` (map + `permanent: true` pinned) and its repo-wide grep step with expected output.
2. **A shell without its trio, or the root skeleton resurrected.** A group missing `loading.tsx` gets **no** boundary once the root one dies — hard navigations hang, it looks like a perf bug, and someone restores a root skeleton. → Task 11's `app-routes.test.ts` asserts every group carries `layout.tsx` + `loading.tsx` + `error.tsx` and that the app root has no `loading.tsx` and no `page.tsx`; each group task ships its trio in the group's birth commit.
3. **The seller tree leaking into the public shell.** One `href="/messages"`, `/disputes/{id}`, `/returns/{id}` or `/shop/manage` under `app/(seller)`, `components/seller` or `lib/seller-nav.ts` re-creates the complaint. → Task 11's `link-shell.test.ts` (source grep as a test); the sidebar regroup itself kept honest by Task 5's rewritten `seller-nav.test.ts`, every count/entry edit carrying the ruling it cites.
4. **Two pages, one URL — or two slug names, one position.** Route groups make "parallel pages" possible (`(public)/x` + `(seller)/x`), a second `<html>` in a group layout breaks the build, and the web tree now grows `returns/[id]`/`disputes/[id]` siblings across groups — the API router already died on the slug twin (79c17e8). → Task 11's guard, (a)–(c), plus `bun run build` in every task.
5. **Pinned paths "fixed" by loosening.** The order-actions/status/payment-status parity suites and `shop-entry.test.ts`'s literal `"/seller" | "/shop/new"` union must come out of this pass byte-identical — none of them names a path this plan changes. → Task 12's untouched-diff assertion (`git diff` empty on the five files); every repointed link's test repointed in the same commit instead.
6. **`ChatProvider` demoted into `(public)`.** A reviewer "cleaning up" by moving it to its heaviest consumer silently kills the seller inbox's live updates and reconnects the socket on every hat switch. → Task 11's root-layout source pin.

## Current state (verified 2026-10-10 on `dev`)

- **82 `page.tsx`** under `packages/web/src/app`, none in a route group. `app/layout.tsx` mounts `Header` + `CategoryBar` + `Footer` around every route; the only escape is `components/layout/site-chrome.tsx` returning `null` when `pathname.startsWith("/r/")`.
- **`app/loading.tsx` is a home-page skeleton** (blue hero band, category circles, card grid). Per-page `loading.tsx` exists only at: root, `create`, `favorites`, `listing/[id]`, `messages`, `profile/me`, `profile/me/listings`, `search`. `/seller/**` has none — the home hero is what a cold `/seller/orders` paints.
- **`app/seller/layout.tsx`** gates with `getMyShop()` → `redirect("/shop/new")` and renders `SellerShell` *inside* the public chrome: `seller-sidebar.tsx` is `lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)]` because the public h-14 header still sits above it; `seller-shell.tsx` is `min-h-[calc(100vh-3.5rem)]`. The sidebar already carries the two canvas exits (`t("viewShop")` → `/s/{handle}`, `t("buyerMode")` → `/`) and the shop identity block (`Seller.space`).
- **`app/shop/manage/layout.tsx`** is a byte-level duplicate of the seller layout (same gate, same `SellerShell`). References to `/shop/manage`: `lib/seller-nav.ts:125`, `components/seller/first-run-checklist.tsx:26,43`, `components/seller/catalogue-empty.tsx:21` — and nothing else under `src` (no test pins it).
- **`app/moderation/layout.tsx`** is the `notFound()` gate (its comment explains why not a 403) plus a two-link inline `<nav>` (`ModerationDisputes.navVerification` / `navDisputes`), inside the full public chrome. It fetches `/api/users/me` and narrows to `Pick<User, "role">`.
- **`app/r/[token]/layout.tsx`** already has the bare anatomy (wordmark + `LocaleSwitcher`) and the credential metadata (`robots: noindex`, `referrer: "no-referrer"`) — it only needs promotion to a group.
- **`lib/seller-nav.ts`: 17 entries** including `messages` → `/messages` (the public chat, `permission: null`) and `settings` → `/shop/manage`. `visibleSellerNav(role, ordersEnabled, protectedPaymentEnabled, resaleEnabled, deliveryZonesEnabled)` AND-combines flags; `payments` is the only `protectedPayment: true` entry. `seller-nav.test.ts` (9 cases) asserts keys, not hrefs — including `visibleSellerNav(null, true)` → `["dashboard", "messages"]` and a billing/orderSettings trio. `seller-sidebar.tsx` holds `ICONS: Record<SellerNavKey, LucideIcon>` (type-forced total) and a local prefix `isActive`.
- **Seller ejections, verified:** `app/seller/disputes/seller-disputes-client.tsx:52` → `` `/disputes/${id}` ``; `app/seller/returns/seller-returns-client.tsx:54` → `` `/returns/${id}` ``. No other `href` under `app/seller` or `components/seller` starts with `/messages`, `/disputes/` or `/returns/`.
- **Case detail today:** `app/returns/[id]/` holds `page.tsx` (self-gates on `getAuthUser`, redirect keeps the path) + `return-case-client.tsx` + `return-evidence-upload.tsx` + `return-inspection-form.tsx` + `return-refund-proof-form.tsx` + `seller-return-actions.tsx`; `app/disputes/[id]/` holds `page.tsx` + `dispute-thread-client.tsx`. Actions are already **server-decided** (`allowedActions` on the wire; `lib/seller-return-actions.ts` filters by `SELLER_RETURN_ACTIONS` from `api/src/contracts/returnInputs`; `DisputeView` carries `viewerRole`). The split is a frame job, not an actions job.
- **Chat:** one system, `ChatProvider` in the root layout. Buyer surface `app/messages/messages-client.tsx` handles `?conversation=` and already links sellers across (`:677` → `/seller/messages?conversation=…`). Seller surface `app/seller/messages/inbox-client.tsx` does **not** read `?conversation=` — yet `lib/shop-activity.ts:57` already emits `/seller/messages?conversation={id}` (its test pins that URL), so the deep link lands on an inbox that ignores it.
- **No cross-section affordances yet:** `/seller/team` has no "Journal complet" link to `/seller/team/activity`; `/seller` and `/seller/insights` have no tab row (only `seller-insights-preview.tsx:64`'s card link); `/seller/payments` and `/seller/billing` do not reference each other (`payments/page.tsx`'s comment: it deliberately ignores `protectedPaymentEnabled`).
- **`src/middleware.ts`** protects `/courier /create /favorites /messages /profile/me /seller /settings /shop` by cookie, writing `?redirect={pathname}`. **`next.config.ts`** has no `redirects()` yet; `output: "standalone"`; the web `Dockerfile` exists.
- **Locale state:** `Seller.nav.*` has all 17 keys; `Checkout` has `back` but no shell keys; `Moderation` has `title`/`subtitle` (the verification queue's own) but no shell block; `Rider` exists; `Demo` exists (the i18n-demo page's). `messages-parity` ceilings: 0 EN-only / 1 FR-only; `messages-keys` ceiling 336.
- **Gates green today:** web `bun test` ~470, `bun run build` passes, client casts 77.
- **The API twin to copy:** `packages/api/tests/int/route-slug-consistency.int.spec.ts` — a static `src/app` walker that pins the slug-name rule the router only checks at boot.

## Target shells and migration ownership

Directory shape (URLs unchanged by the parentheses) and which task owns which rows of the spec's 82-page table — every row is owned exactly once:

| Group | Layout contents | Table rows owned | Task |
|---|---|---|---|
| root | `<html>/<body>`, fonts, metadata, JSON-LD, providers (incl. `ChatProvider`); `global-error.tsx`, `not-found.tsx`, `error.tsx` (group-layout failures) — **no page, no loading** | — | 1 |
| `(public)` | `Header` + `CategoryBar` + content + `Footer`, moved verbatim | 35 REWRAPs (`/`, search, listing×2, s, profile×4, favorites, settings, create, cart, messages, purchases×4, account×2, invite, courier, shop/new, help/contact/safety/privacy/terms/cookies, auth×4, i18n-demo) **+ the buyer halves of the 2 SPLIT rows** (`/returns/[id]`, `/disputes/[id]`) | 1 |
| `(bare)` | the promoted rider layout | 1 REWRAP (`/r/[token]`) | 1 |
| `(checkout)` | `Header` + breadcrumb "Retour au panier · Commande sécurisée" + slim trust footer; no category bar, no marketing footer | 4 REWRAPs (`/checkout`, pay, pending, confirmation) | 2 |
| `(ops)` | "Modération BuyNSellem · Espace équipe interne" block, own sidebar (Vérifications, Litiges), audit notice, moderator identity footer; `notFound()` gate kept | 4 REWRAPs (`/moderation/verification`×2, `/moderation/disputes`×2) | 3 |
| `(seller)` | `SellerSidebar` + workspace top bar (`ShopSwitcher`) + `SuspensionBanner` + content; no public chrome | 35 REWRAPs (every `/seller/*` row incl. `settings/orders`) | 4 |
| `(seller)` new pages | — | SPLIT seller halves: `+/seller/returns/[id]`, `+/seller/disputes/[id]` | 6, 7 |
| `(seller)` moved page | — | MOVE: `/shop/manage` → `/seller/settings` + 308 | 10 |

Totals reconcile with the spec: **79 REWRAP (35+1+4+4+35) · 1 MOVE · 2 SPLIT.**

## File structure

New, `packages/web/src/`:
- `app/(public)/layout.tsx`, `app/(public)/loading.tsx`, `app/(public)/error.tsx`
- `app/(bare)/layout.tsx` (promoted from `app/r/[token]/layout.tsx`), `app/(bare)/loading.tsx`, `app/(bare)/error.tsx`
- `app/(checkout)/layout.tsx`, `loading.tsx`, `error.tsx`
- `app/(ops)/layout.tsx` (rewritten from `app/moderation/layout.tsx`), `loading.tsx`, `error.tsx`
- `app/(seller)/layout.tsx` (promoted from `app/seller/layout.tsx`), `loading.tsx`, `error.tsx`
- `app/(seller)/seller/returns/[id]/page.tsx`, `app/(seller)/seller/disputes/[id]/page.tsx` (the SPLITs)
- `app/(seller)/seller/settings/page.tsx` + `shop-settings-client.tsx` (the MOVE, `git mv` from `app/shop/manage/`)
- `components/cases/return/` (the five return-case client files, `git mv` from `app/returns/[id]/`), `components/cases/dispute/dispute-thread-client.tsx` (`git mv`)
- `components/seller/section-tabs.tsx`, `components/seller/workspace-breadcrumb.tsx`
- `lib/redirects.ts` (+ `redirects.test.ts`), `lib/app-routes.test.ts`, `lib/link-shell.test.ts`

Modified: `app/layout.tsx` (demoted), `app/loading.tsx` (neutralised Task 1, deleted Task 10), `src/lib/seller-nav.ts` (+ its test), `components/seller/seller-shell.tsx`, `components/seller/seller-sidebar.tsx`, `components/seller/first-run-checklist.tsx`, `components/seller/catalogue-empty.tsx`, `components/layout/header.tsx`, `app/(seller)/seller/messages/page.tsx` + `inbox-client.tsx`, `app/(seller)/seller/{disputes,returns}/seller-*-client.tsx` (row links), `app/(seller)/seller/{page,insights,team,payments,billing}` pages (tab rows / links), `next.config.ts` (redirects), `messages/en.json` + `messages/fr.json`.

Deleted: `components/layout/site-chrome.tsx` (T1), `app/shop/manage/layout.tsx` + directory (T10), `app/(public)/i18n-demo/` + `components/demo/i18n-client-demo.tsx` + the `Demo` namespace (T10), `app/loading.tsx` (T10), `app/r/[token]/layout.tsx` (promoted, T1).

## Task dependency structure

- Wave 1: Task 1 (the chromeless root, `(public)`, `(bare)`).
- Wave 2 (parallel): Task 2 `(checkout)`, Task 3 `(ops)`, Task 4 `(seller)` — disjoint directories.
- Wave 3: Task 5 (sidebar regroup; owns `lib/seller-nav.ts`, its test, `seller-sidebar.tsx`).
- Wave 4 (parallel): Task 6 (returns SPLIT), Task 7 (disputes SPLIT) — disjoint directories.
- Wave 5 (parallel): Task 8 (chat two-surfaces), Task 9 (header button, Decision 1).
- Wave 6: Task 10 (the MOVE + 308 + deletions; owns `seller-nav.ts` again and `next.config.ts`).
- Wave 7: Task 11 (route-tree guard + link-shell invariants — after every move, so the pins pin the final tree).
- Wave 8: Task 12 (structure checkpoint).
- Wave 9: Task 13 (final verification + the golden-path click-through).

Worktree-per-agent (AGENTS.md's P3 lesson); tasks sharing a file are in different waves, as noted per task.

## Wave 1 — the root demoted, the public and bare shells born

### Task 1: The chromeless root, `(public)` and `(bare)` — `SiteChrome` dies

**Files:**
- Modify: `src/app/layout.tsx` (demote), `src/app/loading.tsx` (neutralise content, file survives until Task 10).
- Create: `src/app/(public)/layout.tsx`, `src/app/(public)/loading.tsx`, `src/app/(public)/error.tsx`, `src/app/(bare)/layout.tsx`, `src/app/(bare)/loading.tsx`, `src/app/(bare)/error.tsx`.
- Move (`git mv`): the 37 public directories/files listed in Step 3 into `(public)/`; `app/r` → `app/(bare)/r`; `app/r/[token]/layout.tsx` → `app/(bare)/layout.tsx`.
- Delete: `src/components/layout/site-chrome.tsx`.

**Interfaces:**
- Produces: a root layout rendering only `<html>/<body>` + fonts + metadata + JSON-LD + the five providers (`getPublicConfig` stays — `AppConfigProvider` feeds every shell); the chrome `<div className="relative flex min-h-screen flex-col">` and `getCategories()` move verbatim into `(public)/layout.tsx`.
- Consumes: nothing new. `~/`-alias imports survive every move; the few relative imports (`contact/layout.tsx`, co-located clients) move with their directories.
- The spec's commit-1 rule holds: `(bare)` lands in the same commit that deletes `SiteChrome`, because the rider page depends on the hack being *replaced*.

- [ ] **Step 1: demote the root.** In `app/layout.tsx`: remove the `SiteChrome`, `Header`, `CategoryBar`, `Footer` imports, `getCategories`, and the chrome wrapper; the body becomes exactly:

  ```tsx
  <NextIntlClientProvider locale={locale} messages={messages}>
    <QueryProvider>
      <AppConfigProvider initialConfig={config}>
        <AuthProvider>
          <ChatProvider>{children}</ChatProvider>
        </AuthProvider>
      </AppConfigProvider>
    </QueryProvider>
  </NextIntlClientProvider>
  ```

  Delete `components/layout/site-chrome.tsx`. Root `metadata`, fonts, `globals.css`, JSON-LD, `global-error.tsx`, `not-found.tsx` and `error.tsx` stay at the root (`error.tsx` is now the boundary for group-*layout* failures — the step-tagged `getMyShop` throw from the future `(seller)/layout.tsx` lands here, named).
- [ ] **Step 2: the `(public)` shell.** `app/(public)/layout.tsx`:

  ```tsx
  import { CategoryBar } from "~/components/layout/category-bar";
  import { Footer } from "~/components/layout/footer";
  import { Header } from "~/components/layout/header";
  import { serverFetch } from "~/lib/server-api";
  import type { Category } from "~/types";

  async function getCategories(): Promise<Category[]> {
  	try {
  		const res = await serverFetch("/api/public/categories?depth=1");
  		if (!res.ok) return [];
  		const data = await res.json();
  		return data.categories || [];
  	} catch {
  		return [];
  	}
  }

  export default async function PublicLayout({
  	children,
  }: {
  	children: React.ReactNode;
  }) {
  	const categories = await getCategories();
  	return (
  		<div className="relative flex min-h-screen flex-col">
  			<Header novuAppId={process.env.NOVU_APPLICATION_IDENTIFIER} />
  			<CategoryBar categories={categories} />
  			<main className="flex-1">{children}</main>
  			<Footer />
  		</div>
  	);
  }
  ```

  `(public)/loading.tsx`: the **neutral content skeleton** — the title-bar + card-grid sections of today's root skeleton, with the hero band and category circles removed (the hero is the home page's own business; per spec §3 we deliberately do *not* add a per-page hero fallback for `/` — the neutral skeleton serves it too). `(public)/error.tsx`: copy the pattern of `src/app/error.tsx` (client component, retry + home links).
- [ ] **Step 3: move the public pages** — `git mv` into `src/app/(public)/`, URLs unchanged: `page.tsx`, `search`, `listing`, `s`, `profile`, `favorites`, `settings`, `create`, `cart`, `messages`, `purchases`, `account`, `returns`, `disputes`, `invite`, `courier`, `help`, `contact`, `safety`, `privacy`, `terms`, `cookies`, `auth`, `i18n-demo`, and `shop/new` → `(public)/shop/new` (**`shop/manage` stays put** — it moves only in Task 10, keeping its own standalone layout meanwhile). `returns/[id]` and `disputes/[id]` are the SPLIT rows' buyer halves — they move here, their seller twins arrive in Tasks 6–7. Co-located `loading.tsx`/`not-found.tsx`/tests move along and keep working (deeper boundaries win over the group's).
- [ ] **Step 4: the `(bare)` shell.** `git mv src/app/r src/app/\(bare\)/r`, then `git mv "src/app/(bare)/r/[token]/layout.tsx" "src/app/(bare)/layout.tsx"` — the promoted layout keeps the wordmark + `LocaleSwitcher` **and the credential metadata verbatim** (`robots: { index: false, follow: false }`, `referrer: "no-referrer"`). Add `(bare)/loading.tsx` (three stacked pulse blocks inside the same max-w-md column) and `(bare)/error.tsx` (retry only — a rider has no account, so no home link into the marketplace chrome).
- [ ] **Step 5: neutralise the root skeleton.** Replace `app/loading.tsx`'s hero/categories/grid content with the same neutral pane as `(public)/loading.tsx` plus a comment: `// Serves only the segments not yet in a group (checkout, seller, moderation, shop/manage). Task 10 deletes this file once the last one moves.` No segment can ever again paint the home anatomy.
- [ ] **Step 6: green.** `cd packages/web && bun run build && bun test`. Expected transient state, named: `/checkout`, `/seller/*`, `/moderation/*` and `/shop/manage` render without the public header until their Wave-2 tasks — each is self-contained and functional (checkout's own form, the standalone `SellerShell`, the gated moderation container). `grep -rn "SiteChrome" src` → nothing.
- [ ] **Step 7: mutation evidence.** Delete the `metadata` export (`robots`/`referrer`) from `(bare)/layout.tsx` → `curl -s localhost:3001/r/test | grep noindex` in dev comes back empty — the credential page would leak referrers, and nothing is red yet (Task 13's click-through item 5 is the standing check; note the asymmetry in the report). Restore the export verbatim, then confirm the promotion left one layout above the token page: `find "src/app/(bare)" -name layout.tsx` → exactly `src/app/(bare)/layout.tsx`.
- [ ] **Step 8: commit** — `refactor(web): the chromeless root — (public) and (bare) route groups replace SiteChrome`. Record the parent SHA of this commit in the task report: it is the `<base>` Task 12's untouched-pins diff runs against.

## Wave 2 — the three remaining shells, in parallel

### Task 2: `(checkout)` — the focused purchase shell (Decision 6)

**Files:**
- Create: `src/app/(checkout)/layout.tsx`, `loading.tsx`, `error.tsx`.
- Move (`git mv`): `src/app/checkout` → `src/app/(checkout)/checkout`.
- Modify: `messages/en.json`, `messages/fr.json` (`Checkout.shell.*`).

**Interfaces:**
- Produces: the BuyWebCheckout anatomy — public `Header` kept, breadcrumb row "Retour au panier · Commande sécurisée", slim trust footer; **no `CategoryBar`, no marketing `Footer`**.
- Consumes: `Header` (already standalone — it does not need categories), the root providers.

- [ ] **Step 1: the layout.**

  ```tsx
  import { ArrowLeft, Lock } from "lucide-react";
  import Link from "next/link";
  import { getTranslations } from "next-intl/server";
  import { Header } from "~/components/layout/header";

  export default async function CheckoutLayout({
  	children,
  }: {
  	children: React.ReactNode;
  }) {
  	const t = await getTranslations("Checkout");
  	return (
  		<div className="flex min-h-screen flex-col">
  			<Header novuAppId={process.env.NOVU_APPLICATION_IDENTIFIER} />
  			<div className="border-[#E2E8F0] border-b bg-white">
  				<div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
  					<Link
  						href="/cart"
  						className="inline-flex items-center gap-2 text-[#1E40AF] text-sm hover:underline"
  					>
  						<ArrowLeft aria-hidden="true" className="h-4 w-4" />
  						{t("shell.backToCart")}
  					</Link>
  					<span className="inline-flex items-center gap-1.5 text-[#64748B] text-sm">
  						<Lock aria-hidden="true" className="h-3.5 w-3.5" />
  						{t("shell.secure")}
  					</span>
  				</div>
  			</div>
  			<main className="flex-1 bg-[#F8FAFC]">{children}</main>
  			<footer className="border-[#E2E8F0] border-t bg-white py-4 text-center text-[#94A3B8] text-xs">
  				{t("shell.trust")}
  			</footer>
  		</div>
  	);
  }
  ```

  Keys in **both** locale files: `Checkout.shell.backToCart` (fr "Retour au panier"), `Checkout.shell.secure` (fr "Commande sécurisée"), `Checkout.shell.trust` (fr "Paiement protégé · Vos données restent privées" / en equivalent). `(checkout)/loading.tsx`: a two-column pane skeleton (form blocks left, summary card right) under nothing — the layout persists. `(checkout)/error.tsx`: retry + back-to-cart.
- [ ] **Step 2: move** — `git mv src/app/checkout "src/app/(checkout)/checkout"`. The four pages (`checkout`, `[orderId]/pay`, `[orderId]/pending`, `confirmation/[id]`) keep their URLs and self-gates.
- [ ] **Step 3: green** — `bun run build && bun test`; `messages-parity` and `messages-keys` green with the three new keys.
- [ ] **Step 4: mutation** — remove `Checkout.shell.secure` from `fr.json` only → `messages-parity` names it. Restore.
- [ ] **Step 5: commit** — `feat(web): the (checkout) focus shell — header and breadcrumb, no category bar or marketing footer`

### Task 3: `(ops)` — the moderation shell

**Files:**
- Create: `src/app/(ops)/layout.tsx`, `loading.tsx`, `error.tsx`.
- Move (`git mv`): `src/app/moderation` → `src/app/(ops)/moderation`; delete the old `moderation/layout.tsx` inline-nav body as part of writing the group layout (the *gate* moves up verbatim).
- Modify: `messages/en.json`, `messages/fr.json` (`Moderation.shell.*`).

**Interfaces:**
- Produces: the OpsWebVerifyQueue anatomy — "Modération BuyNSellem · Espace équipe interne" block, own sidebar with the two existing sections only (Vérifications, Litiges — the other `OpsWeb*` entries arrive with their phases, per spec Out of scope), the audit notice, the moderator identity footer. The `notFound()` gate and its comment move **verbatim** — the surface's existence stays unadvertised, and the gate still ignores the verification feature flag.
- Consumes: `isModerator`, `serverFetch`, the existing `ModerationDisputes.navVerification`/`navDisputes` keys (reused as the sidebar labels).

- [ ] **Step 1: the layout.** `app/(ops)/layout.tsx` — the gate first, widened only to read the identity it already fetched:

  ```tsx
  import Link from "next/link";
  import { notFound } from "next/navigation";
  import { getTranslations } from "next-intl/server";
  import { isModerator } from "~/lib/moderation-verification";
  import { serverFetch } from "~/lib/server-api";
  import type { User } from "~/types";

  /**
   * Gates every `/moderation/*` screen. `notFound()`, not a redirect or a 403:
   * the moderation surface's existence is not advertised to anyone below
   * moderator rank. Never checks the verification feature flag — the reviewer
   * routes ignore it entirely, so this gate must not either.
   */
  export default async function OpsLayout({
  	children,
  }: {
  	children: React.ReactNode;
  }) {
  	const res = await serverFetch("/api/users/me");
  	const body: { user?: Pick<User, "role" | "name" | "email"> | null } = res.ok
  		? await res.json()
  		: {};
  	if (!isModerator(body.user)) notFound();

  	const [t, tNav] = await Promise.all([
  		getTranslations("Moderation"),
  		getTranslations("ModerationDisputes"),
  	]);
  	const entries = [
  		{ href: "/moderation/verification", label: tNav("navVerification") },
  		{ href: "/moderation/disputes", label: tNav("navDisputes") },
  	];
  	return (
  		<div className="min-h-screen bg-[#F8FAFC] lg:flex">
  			<aside className="border-[#E2E8F0] border-b bg-white lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
  				<div className="p-4">
  					<p className="font-bold text-[#0F172A] text-sm">{t("shell.title")}</p>
  					<p className="text-[#64748B] text-xs">{t("shell.subtitle")}</p>
  				</div>
  				<nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col">
  					{entries.map((entry) => (
  						<Link
  							key={entry.href}
  							href={entry.href}
  							className="shrink-0 rounded-lg px-3 py-2 font-medium text-[#334155] text-sm hover:bg-[#F8FAFC]"
  						>
  							{entry.label}
  						</Link>
  					))}
  				</nav>
  				<p className="hidden p-4 text-[#94A3B8] text-xs lg:block">
  					{t("shell.auditNotice")}
  				</p>
  			</aside>
  			<div className="min-w-0 flex-1">
  				<div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
  				<p className="px-4 pb-4 text-[#94A3B8] text-xs">
  					{t("shell.signedInAs", {
  						name: body.user?.name ?? body.user?.email ?? "",
  					})}
  				</p>
  			</div>
  		</div>
  	);
  }
  ```

  Keys in both files: `Moderation.shell.title` (fr "Modération BuyNSellem"), `shell.subtitle` (fr "Espace équipe interne"), `shell.auditNotice` (fr "Chaque consultation de pièce est inscrite au journal."), `shell.signedInAs` (fr "Connecté : {name}" / en "Signed in as {name}" — web interpolation is `{x}`).
- [ ] **Step 2: move** — `git mv src/app/moderation "src/app/(ops)/moderation"`; the old `moderation/layout.tsx` is deleted in the same commit (its gate now lives one level up — nothing under `(ops)/moderation/` re-gates). `(ops)/loading.tsx`: a queue-row pane skeleton (title bar + 6 rows). `(ops)/error.tsx`: retry inside the shell.
- [ ] **Step 3: green** — `bun run build && bun test`; the moderation specs (`moderation-disputes.test.ts`, `moderation-verification.test.ts`, `dispute-moderation.test.tsx`) are pure/lib tests and must pass untouched.
- [ ] **Step 4: mutation** — swap the gate to `if (!isModerator(body.user)) redirect("/")` → nothing fails (no test pins it yet; Task 11's guard doesn't either — this is deliberate manual evidence that the gate's shape rests on review, which is why Task 13's click-through replays "non-moderator → 404"). Restore the `notFound()` verbatim and note the asymmetry in the task report.
- [ ] **Step 5: commit** — `feat(web): the (ops) moderation shell — team-space sidebar and audit notice around the notFound gate`

### Task 4: `(seller)` — the workspace shell, skeleton and breadcrumbs

**Files:**
- Move (`git mv`): `src/app/seller` → `src/app/(seller)/seller`; then `git mv "src/app/(seller)/seller/layout.tsx" "src/app/(seller)/layout.tsx"` (the gate is promoted, byte-identical).
- Create: `src/app/(seller)/loading.tsx`, `src/app/(seller)/error.tsx`, `src/components/seller/workspace-breadcrumb.tsx`.
- Modify: `src/components/seller/seller-shell.tsx`, `src/components/seller/seller-sidebar.tsx`, the five existing detail pages that gain a breadcrumb, `messages/{en,fr}.json` (`Seller.errorRetry`/`errorBackToDashboard` + breadcrumb-free; nav labels reused).

**Interfaces:**
- Produces: the workspace with **no public chrome**: full-height sidebar, a workspace top bar (shop identity line + `ShopSwitcher`), `SuspensionBanner` (already in the shell — kept), a pane-only loading skeleton, an in-shell error boundary, and `WorkspaceBreadcrumb` for detail pages (`Section › reference`, labels from the existing `Seller.nav.*` keys).
- Consumes: `getMyShop` (step-tagged, unchanged), `SellerShell`, `visibleSellerNav` (regrouped only in Task 5 — this task changes no nav entry).

- [ ] **Step 1: promote and unhook from the public header.** After the two `git mv` commands, edit the height math that assumed an h-14 header above:
  - `seller-sidebar.tsx`: `lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)]` → `lg:sticky lg:top-0 lg:h-screen`.
  - `seller-shell.tsx`: `min-h-[calc(100vh-3.5rem)]` → `min-h-screen`, and lift `ShopSwitcher` out of the content column into a top bar row:

  ```tsx
  <div className="min-w-0 flex-1">
  	<div className="flex items-center justify-between border-[#E2E8F0] border-b bg-white px-4 py-2.5 sm:px-6">
  		<p className="truncate text-[#64748B] text-sm">
  			<span className="font-semibold text-[#0F172A]">{shop.name}</span>
  			{" · "}
  			{/* "Espace vendeur" — the existing Seller.space key */}
  			{tSpace}
  		</p>
  		<ShopSwitcher activeShopId={shop.id} />
  	</div>
  	<SuspensionBanner shop={shop} locale={locale} />
  	<div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
  </div>
  ```

  (`tSpace` = `getTranslations("Seller")` then `t("space")` — the key exists.) The sidebar's shop block, `LevelBadge`, `OrdersRestrictedNotice` and the two footer exits (`viewShop` → `/s/{handle}`, `buyerMode` → `/`) are already right — untouched.
- [ ] **Step 2: the trio.** `(seller)/loading.tsx` — a **content-pane** skeleton rendered beside the live sidebar (the sidebar is in the layout, already on screen; this file must never redraw it):

  ```tsx
  export default function Loading() {
  	// Renders inside the (seller) layout's own max-w/px container — no outer
  	// wrapper here, or the pane double-pads.
  	return (
  		<div>
  			<div className="mb-6 h-7 w-56 animate-pulse rounded bg-[#E2E8F0]" />
  			<div className="mb-4 flex gap-2">
  				{Array.from({ length: 3 }).map((_, i) => (
  					<div key={i} className="h-9 w-28 animate-pulse rounded-lg bg-[#E2E8F0]" />
  				))}
  			</div>
  			<div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
  				{Array.from({ length: 6 }).map((_, i) => (
  					<div key={i} className="h-14 animate-pulse border-[#F1F5F9] border-b bg-white" />
  				))}
  			</div>
  		</div>
  	);
  }
  ```

  `(seller)/error.tsx`: client boundary styled inside the shell — `Seller.errorRetry` ("Réessayer"/"Try again") calling `reset()`, `Seller.errorBackToDashboard` ("Retour au tableau de bord"/"Back to dashboard") linking `/seller`; both keys in both files.
- [ ] **Step 3: breadcrumbs.** `components/seller/workspace-breadcrumb.tsx`:

  ```tsx
  import Link from "next/link";
  import { useTranslations } from "next-intl";
  import type { SellerNavKey } from "~/lib/seller-nav";

  /** `Section › reference` for workspace detail pages (spec §5). List pages
   * show the title block instead and never render this. */
  export function WorkspaceBreadcrumb({
  	section,
  	href,
  	reference,
  }: {
  	section: SellerNavKey;
  	href: string;
  	reference: string;
  }) {
  	const t = useTranslations("Seller");
  	return (
  		<nav className="mb-4 text-[#64748B] text-sm">
  			<Link href={href} className="hover:underline">
  				{t(`nav.${section}`)}
  			</Link>
  			<span className="mx-1.5">›</span>
  			<span className="font-medium text-[#0F172A]">{reference}</span>
  		</nav>
  	);
  }
  ```

  Wire it into the five existing detail pages, each passing its own fetched reference: `seller/orders/[id]` (`orders`, the order number), `seller/catalogue/[id]` (`catalogue`, the product title), `seller/billing/[id]` (section **`payments`**, href `/seller/billing`, the invoice number — `billing` leaves `SellerNavKey` in Task 5's regroup and Decision 4 makes Payments its owning section, so wiring it as `payments` here keeps Task 5 from breaking this type), `seller/payments/payouts/[id]` (`payments`, the payout reference), `seller/resale/purchase-orders/[id]` (`resale`, the PO number). The deviation from the spec's "builder from route params" is stated here once: the reference is page *data* (a number the page already fetched), so the pages pass it explicitly and the pure logic under test is Task 5's `activeNavKey` — there is no params-only builder to invent.
- [ ] **Step 4: green** — `bun run build && bun test`. The co-located seller tests (`seller-orders.test.ts`, `action-bar.test.tsx`, …) moved with their directories and must pass unedited.
- [ ] **Step 5: mutation** — delete `(seller)/loading.tsx` → hard-navigate `/seller/orders` in `bun run dev`: the pane hangs on the previous content (the regression Review Focus 2 pins; Task 11 will make this a red test). Restore.
- [ ] **Step 6: commit** — `feat(web): the (seller) workspace shell — full-height sidebar, pane skeleton, in-shell errors, breadcrumbs`

## Wave 3 — the sidebar regroup

### Task 5: Thirteen entries, the absorbed tabs, and `seller-nav.test.ts` kept honest (Decisions 3 and 4)

**Files:**
- Modify: `src/lib/seller-nav.ts`, `src/lib/seller-nav.test.ts`, `src/components/seller/seller-sidebar.tsx` (ICONS + active state), `src/app/(seller)/seller/page.tsx` + `insights/page.tsx` (tabs), `src/app/(seller)/seller/payments/page.tsx` + `billing/page.tsx` (tabs + COD landing), `src/app/(seller)/seller/team/page.tsx` ("Journal complet" link), `messages/{en,fr}.json` (`Seller.tabs.*`; delete `Seller.nav.messages` in both).
- Create: `src/components/seller/section-tabs.tsx`.

**Interfaces:**
- Produces: `SELLER_NAV` at **13 entries** in canvas order — `messages` (the public-chat ejection), `activity`, `billing` and `orderSettings` removed as entries; their pages keep their URLs and are reached as absorbed tabs/links. `activeNavKey(pathname)` so an absorbed tab lights its parent entry. `visibleSellerNav` keeps its exact signature and permission gating; the merged Payments entry keeps `payments.view` and shows when **either** absorbed surface exists.
- Consumes: `can`, the flags from `useAppConfig`, the existing `Seller.nav.*` labels (`billing`, `orderSettings`, `activity` keys **kept** — they become tab/link labels).

- [ ] **Step 1: failing tests first.** Rewrite `seller-nav.test.ts` against the target, each changed expectation carrying the ruling:

  ```ts
  // Spec §2: personal chat is a buyer-hat task reached via "Revenir en mode
  // acheteur" — the /messages entry is removed, so a role-less member now
  // sees the dashboard alone.
  it("leaves a member with no usable role only the dashboard", () => {
  	expect(keys(visibleSellerNav(null, true))).toEqual(["dashboard"]);
  });
  // Spec §5: activity, billing and orderSettings are absorbed tabs, never
  // sidebar entries, whatever the role or flags.
  it("never lists an absorbed page or the public chat as an entry", () => {
  	for (const nav of [
  		keys(visibleSellerNav("owner", true, true, true, true)),
  		keys(visibleSellerNav("owner", false)),
  	]) {
  		expect(nav).not.toContain("messages");
  		expect(nav).not.toContain("activity");
  		expect(nav).not.toContain("billing");
  		expect(nav).not.toContain("orderSettings");
  	}
  });
  // Decision 4: one Payments hub — visible to payments.view holders when
  // EITHER surface exists (protected payouts flag, or the ordersEnabled
  // commission family), hidden when both are off.
  it("shows the payments hub on either flag and hides it on neither", () => {
  	expect(keys(visibleSellerNav("owner", true, false))).toContain("payments");
  	expect(keys(visibleSellerNav("owner", false, true))).toContain("payments");
  	expect(keys(visibleSellerNav("owner", false, false))).not.toContain("payments");
  	expect(keys(visibleSellerNav("staff", true, true))).not.toContain("payments");
  });
  // Spec §5: absorbed tabs light their parent entry.
  it("maps absorbed pathnames to their owning entry", () => {
  	expect(activeNavKey("/seller")).toBe("dashboard");
  	expect(activeNavKey("/seller/insights")).toBe("dashboard"); // Decision 3
  	expect(activeNavKey("/seller/billing/abc")).toBe("payments"); // Decision 4
  	expect(activeNavKey("/seller/team/activity")).toBe("team");
  	expect(activeNavKey("/seller/settings/orders")).toBe("settings");
  	expect(activeNavKey("/seller/resale/links")).toBe("resale");
  	expect(activeNavKey("/messages")).toBeNull();
  });
  ```

  Rework the surviving cases to the 13-entry world (the order-flag diff becomes `["orders", "disputes", "payments", "delivery"]` for an owner with delivery on and protected payment off — billing's old row is now the hub's `ordersEnabled` leg). Run: red.
- [ ] **Step 2: the regrouped `SELLER_NAV`** (canvas order, spec §5 table — Returns and Disputes kept as the stated deviation):

  ```ts
  export const SELLER_NAV = [
  	{ href: "/seller", key: "dashboard", exact: true, permission: null, orders: false },
  	{ href: "/seller/orders", key: "orders", exact: false, permission: "orders.view", orders: true },
  	{ href: "/seller/returns", key: "returns", exact: false, permission: "orders.view", orders: false },
  	{ href: "/seller/disputes", key: "disputes", exact: false, permission: "orders.view", orders: true },
  	{ href: "/seller/catalogue", key: "catalogue", exact: false, permission: "catalogue.edit", orders: false },
  	{ href: "/seller/stock", key: "stock", exact: false, permission: "stock.move", orders: false },
  	{ href: "/seller/resale/catalogue", key: "resale", exact: false, permission: "resale.manage", orders: true, resale: true },
  	{ href: "/seller/messages", key: "inbox", exact: false, permission: "inbox.reply", orders: false },
  	{ href: "/seller/delivery", key: "delivery", exact: false, permission: "settings.edit", orders: true, deliveryZones: true },
  	{
  		href: "/seller/payments",
  		key: "payments",
  		exact: false,
  		permission: "payments.view",
  		orders: false,
  		// Decision 4: payouts AND the commission/billing family behind one
  		// entry; visible when either surface exists. The absorbed tabs keep
  		// their own strictest permission on the tab, not here.
  		paymentsHub: true,
  	},
  	{ href: "/seller/team", key: "team", exact: false, permission: "team.view", orders: false },
  	{ href: "/seller/verification", key: "verification", exact: false, permission: "verification.submit", orders: false },
  	{ href: "/shop/manage", key: "settings", exact: false, permission: "settings.edit", orders: false },
  ] as const satisfies ReadonlyArray<{
  	href: string;
  	key: string;
  	exact: boolean;
  	permission: ShopPermission | null;
  	orders: boolean;
  	paymentsHub?: boolean;
  	resale?: boolean;
  	deliveryZones?: boolean;
  }>;
  ```

  (`protectedPayment` leaves the shape — `paymentsHub` replaces it.)

  (`settings` keeps `/shop/manage` until Task 10 — that task owns the href.) In `visibleSellerNav`, remove the `protectedPayment` leg and add:

  ```ts
  const hub = "paymentsHub" in entry && entry.paymentsHub === true;
  // …inside the filter conjunction, replacing the protectedPayment clause:
  (!hub || ordersEnabled || protectedPaymentEnabled) &&
  ```

  Add the absorption map + `activeNavKey` in the same file:

  ```ts
  /** Absorbed pages light their parent entry (spec §5); longest prefix wins
   * so /seller/resale/* never falls back to the dashboard. */
  const ABSORBED_PREFIXES: ReadonlyArray<readonly [string, SellerNavKey]> = [
  	["/seller/insights", "dashboard"], // Decision 3
  	["/seller/billing", "payments"], // Decision 4
  	["/seller/team/activity", "team"],
  	["/seller/settings/orders", "settings"],
  ];

  export function activeNavKey(pathname: string): SellerNavKey | null {
  	let best: { key: SellerNavKey; length: number } | null = null;
  	const consider = (prefix: string, key: SellerNavKey, exact: boolean) => {
  		const match = exact
  			? pathname === prefix
  			: pathname === prefix || pathname.startsWith(`${prefix}/`);
  		if (match && (!best || prefix.length > best.length))
  			best = { key, length: prefix.length };
  	};
  	for (const entry of SELLER_NAV) consider(entry.href, entry.key, entry.exact);
  	for (const [prefix, key] of ABSORBED_PREFIXES) consider(prefix, key, false);
  	if (!best && (pathname === "/seller" || pathname.startsWith("/seller/")))
  		return "dashboard";
  	return best?.key ?? null;
  }
  ```

  In `seller-sidebar.tsx`: drop the removed keys from `ICONS` (the `Record<SellerNavKey, LucideIcon>` type forces it — `MessageCircle`, `History`, `Receipt`, `SlidersHorizontal` imports go too) and replace the local `isActive` with `activeNavKey(pathname) === key`.
- [ ] **Step 3: the absorbed surfaces stay reachable.** `components/seller/section-tabs.tsx`:

  ```tsx
  "use client";

  import Link from "next/link";
  import { usePathname } from "next/navigation";
  import { cn } from "~/lib/utils";

  export function SectionTabs({
  	tabs,
  }: {
  	tabs: Array<{ href: string; label: string; exact?: boolean }>;
  }) {
  	const pathname = usePathname();
  	return (
  		<div className="mb-6 flex gap-1 border-[#E2E8F0] border-b">
  			{tabs.map((tab) => {
  				const active = tab.exact
  					? pathname === tab.href
  					: pathname === tab.href || pathname.startsWith(`${tab.href}/`);
  				return (
  					<Link
  						key={tab.href}
  						href={tab.href}
  						aria-current={active ? "page" : undefined}
  						className={cn(
  							"px-3 py-2 font-medium text-sm",
  							active
  								? "-mb-px border-[#1E40AF] border-b-2 text-[#1E40AF]"
  								: "text-[#64748B] hover:text-[#0F172A]",
  						)}
  					>
  						{tab.label}
  					</Link>
  				);
  			})}
  		</div>
  	);
  }
  ```

  Team: add the "Journal complet" link on `/seller/team` to `/seller/team/activity`, label `t("nav.activity")` — the key is kept for exactly this.
- [ ] **Step 4 (Decision 3, isolated): dashboard tabs.** On `/seller` and `/seller/insights`, render `SectionTabs` with `[{ href: "/seller", label: t("tabs.today"), exact: true }, { href: "/seller/insights", label: t("tabs.statistics") }]`. New keys both files: `Seller.tabs.today` (fr "Aujourd'hui"), `Seller.tabs.statistics` (fr "Statistiques") — the OpsWebAnalytics tab names. URLs unchanged. A veto reverts this step alone.
- [ ] **Step 5 (Decision 4, isolated): payments tabs.** On `/seller/payments` and `/seller/billing`, render `SectionTabs` with the Payments tab (`t("nav.payments")` → `/seller/payments`) **only when `protectedPaymentEnabled`**, and the Commission tab (`t("nav.billing")` → `/seller/billing`) **only when `ordersEnabled`** — "the tab row adapts to what the shop actually has". Both pages read the flags they already have access to (`useAppConfig` in their clients).
- [ ] **Step 6 (Decision 4, isolated): the COD landing.** In `(seller)/seller/payments/page.tsx` (server component), read the public config (`serverFetch("/api/public/config")`) and `redirect("/seller/billing")` when `protectedPaymentEnabled` is false — a COD-only shop's hub entry lands on commission, never an empty payouts shell. Comment the why. A veto reverts Steps 5–6 together.
- [ ] **Step 7: locale cleanup** — delete `Seller.nav.messages` from `en.json` **and** `fr.json` (unused after this task; `nav.activity`, `nav.billing`, `nav.orderSettings` stay as tab/link labels). `messages-keys` must not rise; `messages-parity` stays at 0/1.
- [ ] **Step 8: green** — `bun test` (the rewritten suite + everything else), `bun run build`.
- [ ] **Step 9: mutation** — restore the `messages` entry to `SELLER_NAV` → the "never lists…" case goes red and `ICONS` type-errors. Restore.
- [ ] **Step 10: commit** — `feat(web): the sidebar regroup — thirteen canvas entries, absorbed tabs, the public-chat entry removed`

## Wave 4 — the SPLITs (two tasks, parallel, disjoint directories)

### Task 6: The seller returns surface — `/seller/returns/[id]`

**Files:**
- Move (`git mv`): `src/app/(public)/returns/[id]/{return-case-client,return-evidence-upload,return-inspection-form,return-refund-proof-form,seller-return-actions}.tsx` → `src/components/cases/return/`.
- Create: `src/app/(seller)/seller/returns/[id]/page.tsx`.
- Modify: `src/components/cases/return/return-case-client.tsx` (surface prop + bridge), `src/app/(public)/returns/[id]/page.tsx` (imports), `src/app/(seller)/seller/returns/seller-returns-client.tsx:54` (row link), `messages/{en,fr}.json` (`Returns.openInWorkspace`).

**Interfaces:**
- Produces: two surfaces over one `GET /api/returns/{id}` — **no API work**; actions stay server-decided via `allowedActions`. `ReturnCaseClient` gains `surface?: "buyer" | "seller"` (default `"buyer"`), which decides only the frame: back-link target, the workspace breadcrumb, and the buyer-side bridge.
- Consumes: the existing returns hooks, `sellerReturnActions` (`lib/seller-return-actions.ts` → `SELLER_RETURN_ACTIONS` from `api/src/contracts/returnInputs` — inside the deploy slice already), `WorkspaceBreadcrumb` (Task 4).

- [ ] **Step 1: extract.** `git mv` the five client files to `src/components/cases/return/`; repoint the buyer `page.tsx` import to `~/components/cases/return/return-case-client`. Relative imports among the five survive (they move together). `bun run build` to prove it.
- [ ] **Step 2: the surface prop.** In `ReturnCaseClient`: `surface` decides the list link (`/account/returns` for buyer, `/seller/returns` for seller) and, when `surface === "seller"`, renders `<WorkspaceBreadcrumb section="returns" href="/seller/returns" reference={view.number} />` above the case (the number is fetched data — `RET-…`). Nothing about actions changes: the server already scopes them.
- [ ] **Step 3: the seller page.**

  ```tsx
  import type { Metadata } from "next";
  import { getTranslations } from "next-intl/server";
  import { ReturnCaseClient } from "~/components/cases/return/return-case-client";

  export async function generateMetadata(): Promise<Metadata> {
  	const t = await getTranslations("Returns");
  	return { title: t("caseTitle") };
  }

  /** The seller surface of the split (spec §1): same case, workspace frame.
   * Auth = the /seller middleware matcher + the (seller) layout's getMyShop
   * gate — no page-level gate, unlike the buyer URL which self-gates. */
  export default async function SellerReturnCasePage({
  	params,
  }: {
  	params: Promise<{ id: string }>;
  }) {
  	const { id } = await params;
  	return <ReturnCaseClient caseId={id} surface="seller" />;
  }
  ```

- [ ] **Step 4: the soft bridge, never a bounce.** In the buyer rendering (`surface === "buyer"`), when `sellerReturnActions(view.allowedActions).length > 0` (the viewer is the shop side), render one line linking `/seller/returns/{id}` with the new key `Returns.openInWorkspace` (fr "Ouvrir dans votre espace vendeur", en "Open in your seller space"; both files). Moderators and edge roles keep seeing the buyer page unprompted.
- [ ] **Step 5: repoint the queue.** `seller-returns-client.tsx:54`: `` `/returns/${…}` `` → `` `/seller/returns/${…}` ``, with a comment citing spec §1 (SPLIT). Pin check, deliberate: `grep -rn '"/returns/\|`/returns/' src/lib src/app --include='*.test.*'` — verified 2026-10-10 to hit **no test** pinning the old row href (only `account/returns`' own buyer link, untouched); record the grep output in the task report so the absence is evidence, not assumption.
- [ ] **Step 6: green** — `bun run build && bun test` (`return-flow`, `return-actions`, `seller-return-actions`, `case-status` untouched and green); locale gates green.
- [ ] **Step 7: mutation** — point the row link back to `/returns/` → no test red yet (Task 11's `link-shell.test.ts` will pin it; say so in the report), but the manual check fails: from `/seller/returns`, a row now leaves the workspace. Restore.
- [ ] **Step 8: commit** — `feat(web): the seller returns surface — /seller/returns/[id] over the same case, buyer URL kept`

### Task 7: The seller disputes surface — `/seller/disputes/[id]`

**Files:**
- Move (`git mv`): `src/app/(public)/disputes/[id]/dispute-thread-client.tsx` → `src/components/cases/dispute/dispute-thread-client.tsx`.
- Create: `src/app/(seller)/seller/disputes/[id]/page.tsx`.
- Modify: the moved client (surface prop + bridge), `src/app/(public)/disputes/[id]/page.tsx` (import), `src/app/(seller)/seller/disputes/seller-disputes-client.tsx:52` (row link), `messages/{en,fr}.json` (`Disputes.openInWorkspace`).

**Interfaces:**
- Produces: the dispute twin of Task 6, same shape: `surface?: "buyer" | "seller"`; seller page renders `<WorkspaceBreadcrumb section="disputes" href="/seller/disputes" reference={view.number} />` (`LIT-…`/`DSP-…` as the API numbers it); back link `/account/disputes` vs `/seller/disputes`.
- Consumes: `useDispute`/`useDisputeAction` (unchanged), `DisputeView.viewerRole` (already on the wire — the P6 contract) for the bridge.

- [ ] **Step 1: extract and repoint the buyer page import** (`git mv`, build green).
- [ ] **Step 2: surface prop + breadcrumb + back link**, as Task 6 Step 2, on `DisputeThreadClient`.
- [ ] **Step 3: the seller page** — same shape as Task 6 Step 3 (`Disputes` namespace for the title; no page-level gate, the layout and middleware gate).
- [ ] **Step 4: the soft bridge** — buyer surface, when `view.viewerRole === "seller" || view.viewerRole === "supplier"`, one line to `/seller/disputes/{id}` with `Disputes.openInWorkspace` (both files). Never automatic.
- [ ] **Step 5: repoint** `seller-disputes-client.tsx:52` → `` `/seller/disputes/${…}` `` with the spec §1 comment; run the same deliberate pin grep for `/disputes/` in tests (expected: only `account/disputes`' buyer link and `purchases/[id]/problem`'s creation push, both buyer-surface, untouched) and record it.
- [ ] **Step 6: green** — build, `bun test` (`dispute-flow`, `dispute-problem`, `moderation-dispute*` untouched), locale gates.
- [ ] **Step 7: mutation** — drop the `viewerRole` condition so every buyer sees the bridge → no unit red (client component, no harness); evidence is the recorded reasoning + Task 13's click-through item 3. Restore.
- [ ] **Step 8: commit** — `feat(web): the seller disputes surface — /seller/disputes/[id] in the workspace, buyer thread kept`

## Wave 5 — chat coherence and the hat switch (parallel)

### Task 8: The chat's two surfaces — the inbox honors its deep link

**Files:**
- Modify: `src/app/(seller)/seller/messages/page.tsx`, `src/app/(seller)/seller/messages/inbox-client.tsx`.

**Interfaces:**
- Produces: `/seller/messages?conversation={id}` selects that conversation in `InboxClient` — mirroring the buyer `/messages?conversation=` shape, as spec §4 demands. `lib/shop-activity.ts:57` already emits exactly this URL (its test pins it; neither moves), so the activity journal's deep links start landing.
- Consumes: `ChatProvider` from the root (untouched — Review Focus 6), the existing conversation list state.

- [ ] **Step 1: thread the param.** `page.tsx` accepts `searchParams: Promise<{ conversation?: string }>` and passes `initialConversationId={conversation ?? null}` to `InboxClient`. In `inbox-client.tsx`, seed the reducer's `selectedId` with the prop (one line in the initial state; the existing `conversations.find` already tolerates an id that never arrives — the panel just stays empty, same as today's no-selection state).
- [ ] **Step 2: the emitter audit, recorded.** `grep -rn '"/messages\|`/messages' src/app/\(seller\) src/components/seller src/lib/seller-nav.ts` → must output nothing (the nav entry died in Task 5; no other emitter existed — Current state). Everything under `(public)` keeps linking `/messages?...` (`purchase-client.tsx:135`, `message-seller-button.tsx:42`) and the buyer client's existing cross-pointer to `/seller/messages?conversation=` (`messages-client.tsx:677`) is correct **by the rule** — the destination is decided by the surface emitting it, and a "answer as the shop" affordance pointing INTO the workspace is the deliberate entry, not a leak.
- [ ] **Step 3: green** — build + `bun test` (`conversation-view`, `shop-activity`, `query-keys` untouched).
- [ ] **Step 4: mutation** — hardcode `initialConversationId` to `null` ignoring the prop → no unit red (client state; Task 13's click-through item 2 is the gate) — note it, restore.
- [ ] **Step 5: commit** — `feat(web): the shop inbox honors ?conversation= — the seller never leaves the workspace to answer`

### Task 9: The seller-hat header button (Decision 1)

**Files:**
- Modify: `src/components/layout/header.tsx`, `messages/{en,fr}.json` if the header's namespace lacks a reusable label.

**Interfaces:**
- Produces: a persistent "Espace vendeur" button in the header whenever `shopEntryFor(...)` answers `{ href: "/seller", key: "myShop" }` — the hat switch leaves the dropdown. Buyers without a shop keep the existing dropdown-only "open a shop" → `/shop/new` (unchanged — `/shop/new` stays `(public)`, it is a buyer *becoming* a seller).
- Consumes: `shopEntryFor` (`lib/shop-entry.ts`) exactly as the header already calls it at line 55 — **its union type and `shop-entry.test.ts` are untouched** (Review Focus 5).

- [ ] **Step 1:** next to the existing account menu, when `entry?.href === "/seller"`, render a `<Link href="/seller">` button (hidden below `sm:`), label = the same translated string the dropdown entry already uses for `entry.key` ("myShop" in the header's namespace); add a key only if the dropdown label is structurally unreachable, in both files.
- [ ] **Step 2: green** — build + tests; `shop-entry.test.ts` must be byte-identical (`git diff --stat src/lib/shop-entry.test.ts` → empty).
- [ ] **Step 3: commit** — `feat(web): a persistent Espace vendeur header button when the user has a shop`

## Wave 6 — the MOVE and the deletions

### Task 10: `/shop/manage` → `/seller/settings` with a permanent 308; `/i18n-demo` and the root skeleton die (Decisions 2 and 8)

**Files:**
- Move (`git mv`): `src/app/shop/manage/page.tsx` + `shop-settings-client.tsx` → `src/app/(seller)/seller/settings/`.
- Delete: `src/app/shop/manage/layout.tsx` (the duplicate shell wiring) and the emptied `shop/manage/` directory; `src/app/(public)/i18n-demo/` + `src/components/demo/i18n-client-demo.tsx`; the `Demo` namespace from both locale files; `src/app/loading.tsx` (the last ungrouped page is gone — the root boundary dies in the same commit, per Review Focus 2's rule).
- Create: `src/lib/redirects.ts`, `src/lib/redirects.test.ts`.
- Modify: `next.config.ts`, `src/lib/seller-nav.ts:125` (+ test), `src/components/seller/first-run-checklist.tsx:26,43`, `src/components/seller/catalogue-empty.tsx:21`, `src/app/(seller)/seller/settings/orders/page.tsx` + the moved settings page (`SectionTabs`).

**Interfaces:**
- Produces: `/seller/settings` inside the workspace (P1WebShopSettings under "Paramètres"); `/shop/manage` and `/shop/manage?move=1` answer **308** to `/seller/settings` with the query preserved; the redirect is permanent and never removed. `settings/orders` becomes the settings section's tab.
- Consumes: the `(seller)` layout's gate (the moved page drops nothing — its old layout's gate was a copy of the group's).

- [ ] **Step 1: failing test first.** `src/lib/redirects.test.ts`:

  ```ts
  import { describe, expect, it } from "bun:test";
  import { PERMANENT_REDIRECTS } from "./redirects";

  describe("the permanent redirect map", () => {
  	it("pins the one URL move: shop settings into the workspace, 308", () => {
  		// Decision 2. Next's redirects() preserves the query string when the
  		// destination declares none, so /shop/manage?move=1 keeps working.
  		expect(PERMANENT_REDIRECTS).toEqual([
  			{
  				source: "/shop/manage",
  				destination: "/seller/settings",
  				permanent: true,
  			},
  		]);
  	});
  });
  ```

  `src/lib/redirects.ts`:

  ```ts
  /** Consumed by next.config.ts redirects(). permanent: true answers 308 —
   * SMS, bookmarks and the mobile in-app browser cannot be re-educated, so
   * this row is never removed. */
  export const PERMANENT_REDIRECTS = [
  	{
  		source: "/shop/manage",
  		destination: "/seller/settings",
  		permanent: true,
  	},
  ] as const;
  ```

  `next.config.ts` (relative import — the config compiles outside the `~` alias):

  ```ts
  import { PERMANENT_REDIRECTS } from "./src/lib/redirects";
  // inside nextConfig:
  	async redirects() {
  		return [...PERMANENT_REDIRECTS];
  	},
  ```

- [ ] **Step 2: the move.** `git mv` the two files into `(seller)/seller/settings/`; delete `shop/manage/layout.tsx` and the directory **in the same commit** (deleted, not copied — no parallel page). The page keeps its own `?move=1` handling (its searchParams travel through the 308). The `settings/orders` page already sits at `(seller)/seller/settings/orders` (Task 4's move) — the new `settings/page.tsx` slots beside it, no slug conflict.
- [ ] **Step 3: repoint the three references, each with the Decision-2 comment:** `seller-nav.ts:125` `href: "/shop/manage"` → `"/seller/settings"`; `first-run-checklist.tsx:26` and `:43` (`?move=1` kept); `catalogue-empty.tsx:21` (`?move=1` kept). Extend `seller-nav.test.ts` deliberately: `expect(SELLER_NAV.some((e) => e.href.startsWith("/shop/manage"))).toBe(false)` with the ruling cited, and `activeNavKey("/seller/settings")` → `"settings"` now holds via the entry itself.
- [ ] **Step 4: tabs.** On `/seller/settings` and `/seller/settings/orders`, `SectionTabs` with `t("nav.settings")` → `/seller/settings` (exact) and `t("nav.orderSettings")` → `/seller/settings/orders`.
- [ ] **Step 5: the repo-wide grep, recorded.** `grep -rn "shop/manage" packages docs --include='*.ts' --include='*.tsx' --include='*.md' | grep -v node_modules` — expected survivors, each named in the report: `packages/mobile/**` (its own native route — untouched by spec Out of scope), this plan and the spec (history), `lib/redirects.ts` + its test (the 308 itself). Anything else — an api notification template, a seed, a doc link — is repointed in this commit.
- [ ] **Step 6 (Decision 8, isolated): delete `/i18n-demo`** — the `(public)/i18n-demo/` directory (page + `actions.ts`), `components/demo/i18n-client-demo.tsx`, and the `Demo` namespace from `en.json` **and** `fr.json` (the scanner's count can only fall). A veto reverts this step alone.
- [ ] **Step 7: delete `src/app/loading.tsx`** — every segment now lives in a group that ships its own boundary; the comment Task 1 left points here.
- [ ] **Step 8: green** — `bun run build` (proves no parallel page, the redirect compiles), `bun test`, locale gates. Middleware check, recorded: `/seller/settings` is matched by the existing `/seller/:path*` row; `/shop/new` keeps `/shop/:path*`; a logged-out `GET /shop/manage` 308s first (Next applies `redirects()` before middleware), then `/seller/settings` hits the matcher and bounces to `/auth/login?redirect=/seller/settings` — the **new** path in the redirect param, as Review Focus demands.
- [ ] **Step 9: mutation** — set `permanent: false` → `redirects.test.ts` red (307 is not the contract). Restore.
- [ ] **Step 10: commit** — `feat(web): shop settings move into the workspace — /shop/manage answers a permanent 308; i18n-demo and the root skeleton deleted`

## Wave 7 — the structure pinned

### Task 11: The web route-tree guard and the link-shell invariants

**Files:**
- Create: `src/lib/app-routes.test.ts`, `src/lib/link-shell.test.ts`.

**Interfaces:**
- Produces: the web twin of `route-slug-consistency.int.spec.ts`, extended to the five-shell contract — this is what stops the next bolted-on wave. Written **after** every move so it pins the final tree, red on any regression.
- Consumes: `node:fs` walking of `src/app`, same idiom as the API twin.

- [ ] **Step 1: the route-tree guard.** `src/lib/app-routes.test.ts`:

  ```ts
  import { describe, expect, test } from "bun:test";
  import { readdirSync, readFileSync, statSync } from "node:fs";
  import path from "node:path";

  /** Web twin of packages/api/tests/int/route-slug-consistency.int.spec.ts,
   * extended to the five-shell contract of the 2026-10-10 spec. Next checks
   * most of this only at build or boot; this pins it in `bun test`. */
  const APP = path.resolve(import.meta.dir, "../app");

  const isDir = (p: string) => statSync(p).isDirectory();
  const isGroup = (name: string) => name.startsWith("(") && name.endsWith(")");

  function walkDirs(dir: string, visit: (dir: string, entries: string[]) => void) {
  	const entries = readdirSync(dir);
  	visit(dir, entries);
  	for (const entry of entries) {
  		const child = path.join(dir, entry);
  		if (isDir(child)) walkDirs(child, visit);
  	}
  }

  describe("the app route tree", () => {
  	test("one slug name per dynamic path position", () => {
  		const conflicts: string[] = [];
  		walkDirs(APP, (dir, entries) => {
  			const dynamic = entries.filter(
  				(e) => e.startsWith("[") && e.endsWith("]") && isDir(path.join(dir, e)),
  			);
  			if (dynamic.length > 1 && new Set(dynamic).size > 1)
  				conflicts.push(`${path.relative(APP, dir)}: ${dynamic.join(" vs ")}`);
  		});
  		expect(conflicts).toEqual([]);
  	});

  	test("no two pages resolve to one URL across groups", () => {
  		const byUrl = new Map<string, string[]>();
  		walkDirs(APP, (dir, entries) => {
  			if (!entries.includes("page.tsx")) return;
  			const rel = path.relative(APP, dir);
  			const url = `/${rel
  				.split(path.sep)
  				.filter((seg) => !isGroup(seg))
  				.join("/")}`.replace(/\/$/, "") || "/";
  			byUrl.set(url, [...(byUrl.get(url) ?? []), rel]);
  		});
  		const parallel = [...byUrl.entries()].filter(([, dirs]) => dirs.length > 1);
  		expect(parallel).toEqual([]);
  	});

  	test("exactly one layout renders <html>", () => {
  		const htmlLayouts: string[] = [];
  		walkDirs(APP, (dir, entries) => {
  			if (!entries.includes("layout.tsx")) return;
  			const source = readFileSync(path.join(dir, "layout.tsx"), "utf8");
  			if (source.includes("<html")) htmlLayouts.push(path.relative(APP, dir) || ".");
  		});
  		expect(htmlLayouts).toEqual(["."]);
  	});

  	test("every shell group ships its layout, loading and error trio", () => {
  		const groups = readdirSync(APP).filter(
  			(e) => isGroup(e) && isDir(path.join(APP, e)),
  		);
  		expect(groups.sort()).toEqual([
  			"(bare)",
  			"(checkout)",
  			"(ops)",
  			"(public)",
  			"(seller)",
  		]);
  		for (const group of groups) {
  			const entries = readdirSync(path.join(APP, group));
  			for (const file of ["layout.tsx", "loading.tsx", "error.tsx"])
  				expect(`${group}/${entries.includes(file) ? file : "MISSING " + file}`).toBe(
  					`${group}/${file}`,
  				);
  		}
  	});

  	test("the root has no loading boundary and no page", () => {
  		const rootEntries = readdirSync(APP);
  		expect(rootEntries).not.toContain("loading.tsx");
  		expect(rootEntries).not.toContain("page.tsx");
  	});

  	test("ChatProvider stays in the root layout, above every shell", () => {
  		const root = readFileSync(path.join(APP, "layout.tsx"), "utf8");
  		expect(root).toContain("<ChatProvider>");
  		// and no group layout mounts its own copy
  		walkDirs(APP, (dir, entries) => {
  			if (dir === APP || !entries.includes("layout.tsx")) return;
  			const source = readFileSync(path.join(dir, "layout.tsx"), "utf8");
  			expect(source.includes("ChatProvider")).toBe(false);
  		});
  	});
  });
  ```

- [ ] **Step 2: the link-shell invariants.** `src/lib/link-shell.test.ts` — the spec's grep-able rule as a test:

  ```ts
  import { describe, expect, test } from "bun:test";
  import { readdirSync, readFileSync, statSync } from "node:fs";
  import path from "node:path";

  /** Spec §2/§4: nothing under the seller tree links into the public shell
   * except the two sidebar-footer exits ("/s/{handle}" and "/"), which no
   * forbidden prefix matches. A literal starting /messages, /disputes/,
   * /returns/ or /shop/manage is a context ejection — the complaint this
   * whole pass exists to kill. */
  const ROOTS = [
  	path.resolve(import.meta.dir, "../app/(seller)"),
  	path.resolve(import.meta.dir, "../components/seller"),
  	path.resolve(import.meta.dir, "./seller-nav.ts"),
  ];
  const FORBIDDEN = /["'`]\/(messages|disputes\/|returns\/|shop\/manage)/;

  function sources(entry: string): string[] {
  	if (!statSync(entry).isDirectory())
  		return /\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry) ? [entry] : [];
  	return readdirSync(entry).flatMap((child) =>
  		sources(path.join(entry, child)),
  	);
  }

  describe("the seller tree never exits its shell", () => {
  	test("no public-surface href under app/(seller), components/seller or the nav", () => {
  		const offenders: string[] = [];
  		for (const file of ROOTS.flatMap(sources)) {
  			const lines = readFileSync(file, "utf8").split("\n");
  			lines.forEach((line, i) => {
  				if (FORBIDDEN.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
  			});
  		}
  		expect(offenders).toEqual([]);
  	});
  });
  ```

- [ ] **Step 3: green** — `bun test src/lib/app-routes.test.ts src/lib/link-shell.test.ts`, then the full suite.
- [ ] **Step 4: mutation × three, each named:** (a) `touch src/app/loading.tsx` → the root-boundary case red; (b) re-add `{ href: "/messages", … }` to `SELLER_NAV` → link-shell red naming `seller-nav.ts`; (c) create a stray `src/app/(public)/seller/page.tsx` → the parallel-URL case red. Remove all three.
- [ ] **Step 5: commit** — `test(web): the route-tree guard and link-shell invariants pin the five-shell architecture`

## Wave 8 — checkpoint

### Task 12: Structure checkpoint

**Files:** none unless a defect is found; the report is the deliverable (the P4/P5 checkpoints each earned their seat).

- [ ] **Step 1: the migration table, replayed.** Generate the live route inventory and diff it against the spec's 82 rows:

  ```bash
  cd packages/web && find src/app -name page.tsx \
    | sed -E 's#^src/app##; s#/\([^)]+\)##g; s#/page\.tsx$##; s#^$#/#' | sort
  ```

  Expected: every spec URL present except `/shop/manage` (moved) and `/i18n-demo` (deleted); plus `/seller/settings`, `/seller/returns/[id]`, `/seller/disputes/[id]` — **83 pages, no other delta**. Every row of the ownership table in this plan must be checked off against a landed commit.
- [ ] **Step 2: the untouched-pins assertion (Review Focus 5).** `git diff <base> -- src/lib/order-actions.test.ts src/lib/order-status.test.ts src/lib/payment-status.test.ts src/lib/shop-entry.test.ts src/lib/shop-activity.test.ts` → **empty**, where `<base>` is the pre-Task-1 SHA recorded in Task 1's report (the work lands on `dev`, so a merge-base against `dev` would be vacuous). Any diff is a leaked behavior change to investigate, not to re-green.
- [ ] **Step 3: full web gates** — `bun run build`, `bun test` (count ≥ ~470 + the new suites, zero failures), `messages-parity` (0 EN-only / ≤1 FR-only), `messages-keys` (≤336).
- [ ] **Step 4: the five shells, eyeballed in `bun run dev`** — one page per shell, confirming chrome, skeleton (throttled reload) and error boundary (`throw` injected momentarily in a page, reverted).
- [ ] **Step 5: report** — defects found (file:line, the fixing commit), the inventory diff, the gate numbers. No commit if clean.

## Wave 9 — final verification

### Task 13: Release gates and the golden-path click-through

**Files:** none (a defect reopens its owning task).

- [ ] **Step 1: the spec's verification greps, verbatim, each output recorded:**
  - `cd packages/web && bun run build` → passes; `cd ../.. && bun run check-types` → passes.
  - `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/docker-slice-guard.int.spec.ts` → green (read-only run; the api tree itself must show `git status` clean, as must `packages/mobile`).
  - `find packages/web/src/app -maxdepth 1 -name "page.tsx" -o -maxdepth 1 -name "loading.tsx"` → nothing.
  - `grep -rn "SiteChrome" packages/web/src` → nothing.
  - `grep -rn '"/messages' "packages/web/src/app/(seller)" packages/web/src/components/seller` → nothing; the same grep for `/disputes/` and `/returns/` finds only `/seller/`-prefixed hrefs.
- [ ] **Step 2: ceilings on a quiet tree, the exact AGENTS.md commands:** client casts ≤ **77** (`grep -ro 'as never' packages/web/src packages/mobile/src packages/mobile/app | wc -l` — this plan added none); api 86 / types:tests 100 / mobile advisory 35 unchanged by construction (trees untouched).
- [ ] **Step 3: the golden-path click-through** — executed once against `bun run dev` + the local api, then handed to the owner as the acceptance list (their three complaints are items 1–3):
  1. Cold-load `/seller/orders`: the workspace skeleton appears **beside the sidebar** — never the home hero.
  2. From the workspace, open `/seller/messages?conversation={id}` (via the activity journal or the inbox) and reply: the sidebar never leaves the screen; the unread badge updates without a reload (the socket survived — `ChatProvider` at the root).
  3. From `/seller/disputes`, open a case: workspace frame, `Litiges › …` breadcrumb, seller actions. Same for `/seller/returns`.
  4. `/shop/manage?move=1` → one 308 → `/seller/settings?move=1`, move panel open.
  5. `/r/{token}`: wordmark + locale switcher only; view-source shows `noindex`.
  6. `/moderation/verification` as a non-moderator: a 404, not a styled shell.
  7. `/checkout`: header + "Retour au panier · Commande sécurisée", **no category bar, no marketing footer**.
  8. Logged out, hit `/seller/settings`, `/seller/returns/{id}`, `/seller/disputes/{id}`, `/seller/messages`, `/checkout`: each round-trips through `/auth/login?redirect={the new path}` (the first three through the `/seller` matcher, checkout through its self-gate).
  9. The hat switch: header "Espace vendeur" → workspace; sidebar "Revenir en mode acheteur" → `/`; a staff member without `orders.view` sees the filtered sidebar, not a 500.
- [ ] **Step 4: report** — every gate's number, every grep's emptiness, the click-through outcomes, and the two user-gate reminders: the nine decisions were implemented at their recommended options (the table at the top maps each to its isolated revert point), and item list above is the owner's acceptance script.

## Plan self-review (performed while writing)

- **Coverage:** the ownership table reconciles all 82 spec rows — 35+1 (Task 1) + 4 (Task 2) + 4 (Task 3) + 35 (Task 4) + 2 SPLIT buyer halves (Task 1) and seller halves (Tasks 6–7) + 1 MOVE (Task 10) = 79 REWRAP · 1 MOVE · 2 SPLIT.
- **Shippable order:** every wave ends with `bun run build && bun test` green; the one named degradation (chromeless checkout/seller/moderation between Waves 1 and 2) involves only self-contained pages and is closed by the very next wave; the root skeleton is neutralised in Task 1 and deleted only when the last ungrouped page moves (Task 10), so no segment ever lacks a boundary and none ever shows another shell's anatomy.
- **Review Focus:** all six have owning pinning tests or named manual evidence (3→Task 11 + Task 5; 1→Task 10; 2,4,6→Task 11; 5→Task 12).
- **No API work:** Tasks 6–8 consume only landed hooks/contracts; the one place a temptation exists (dispute `viewerRole`) is already on the wire.
