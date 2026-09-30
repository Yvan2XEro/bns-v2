# P2 Verification Implementation Plan

Date: 2026-09-30

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a shop prove who is behind it — the owner's identity through a KYC vendor (level 2), the business's registration through a manual review (level 3) — with the level written in one place, read through one helper, shown as a badge buyers can read, identity documents kept in private storage with every look logged and purged on a schedule, and the legacy `users.verified` checkbox retired.

**Architecture:** Three new Payload collections (`verification-requests`, `verification-documents`, `verification-document-views`) whose every write goes through `services/verification.ts` inside `withTransaction`, together with its `moderation-log` entry. A pure `lib/verificationTransitions.ts` owns the status machine, a pure `lib/shopCapabilities.ts` owns what a level unlocks (read at request time, never trusting a job to have run), and `services/shops.ts` gains `setShopLevel` + `onShopLevelChanged` so `shops.level` keeps exactly one writer. Identity data comes from a vendor behind the `KycProvider` interface (one adapter: Didit), never as images; documents live in a second, private storage adapter reachable only through a 60-second signed URL that writes its view log first. Web gets the first browser moderation screens; mobile extends its existing moderation hub.

**Tech Stack:** Payload CMS 3.79 on MongoDB (replica set, P0 transactions), Next.js 16 route handlers, `@payloadcms/storage-s3` / `-azure` 3.79 with a second adapter instance, `@aws-sdk/s3-request-presigner`, Meilisearch via the `search-indexer` Bun worker, Novu, Next.js 16 + next-intl 4 + TanStack Query + react-hook-form/zod (web), Expo SDK 57 + expo-router + i18next + TanStack Query (mobile), Vitest (API), `bun test` (web, mobile, search-indexer), Biome.

**Spec:** `docs/superpowers/specs/2026-09-15-p2-verification-design.md` (parent: `docs/superpowers/specs/2026-09-15-business-layer-design.md`; P0 and P1 are merged — `docs/superpowers/plans/2026-09-15-p0-foundations.md`, `docs/superpowers/plans/2026-09-15-p1-shops.md`).

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec unless a line says otherwise.

### Engineering rules (`AGENTS.md`, binding on every task)

- Strict typing. `any`, `as any`, `@ts-ignore`, `@ts-expect-error` are not accepted. Unknown shapes are `unknown` narrowed by a guard or a zod schema.
- Database types come from `packages/api/src/payload-types.ts`. Run `cd packages/api && bun run generate:types` after any collection change and commit the regenerated file in the same commit.
- Error codes are declared once in `packages/api/src/lib/errors.ts` and translated in **both** clients. Never invent a parallel error string.
- TanStack Query is the only path to server state on both clients. No `fetch` in `useEffect`, no manual loading/error/data triplet. One hook per resource in `src/hooks`, query keys exported beside the hook.
- Forms use `react-hook-form` + zod through `@hookform/resolvers/zod`; one schema per form, `z.infer` for its type; submission through a mutation; server errors mapped back with `setError`. Both packages already have `react-hook-form` and `@hookform/resolvers`.
- A screen with several related pieces of state uses `useReducer` with a single state object and a `(state, patch: Partial<State>) => ({...state, ...patch})` reducer.
- A component file past roughly 200 lines is split. Server Components by default on web; `"use client"` only where interactivity requires it. Mobile lists use `FlashList`. Every interactive element labelled; 44px minimum touch target on mobile.
- Anything writing several documents runs in one transaction (`src/lib/transactions.ts`); a moderation-style action writes its audit entry **in the same transaction**.
- A service that bypasses access control uses `overrideAccess` plus a `req.context` flag, following `src/services/moderation.ts`.
- Routes validate input with zod and answer with the shared error codes. Every environment variable is declared in `docker-compose.yml`, `docker-compose.local.yml` and `docker-compose.atlas.yml` (`docker-compose.prod.yml` only overrides images — nothing to add there).
- Tests assert behaviour a caller or a user observes, never an implementation detail. Write the failing test first, watch it fail, then make it pass.
- Comments only where the reason is non-obvious. Docs, specs, plans and comments in English.
- Commits carry no tooling attribution (`.husky/commit-msg` strips and fails on them; never `--no-verify`). Never `git add .` — always an explicit pathspec. One-off scripts go to `/tmp`, never into the repository.

### Commands

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts <file>   # API tests
cd packages/api && bun run generate:types                                 # after any collection change
cd packages/api && bun run check-types
cd packages/web    && bun test        # web HAS a `test` script; see src/lib/*.test.ts
cd packages/web    && bun run check-types
cd packages/mobile && bun test
cd packages/mobile && bunx tsc --noEmit   # mobile has no check-types script
cd packages/search-indexer && bun run check-types
bunx biome check --write <files>          # from the repo root
```

Five API spec files fail at `HEAD` for reasons that predate this work (module-load timeouts): `api.int.spec.ts`, `boost-callback-route`, `listings-before-change`, `public-categories-route`, `public-search-route`. They are not regressions; compare against the same five, never "fix" them by raising timeouts.

### P2 domain constants

- Levels: 0 none, 1 `phone` (P1), 2 `identity`, 3 `business`. `maxMembers`: 1 / 1 / 5 / 20.
- Expiry on approval: level 2 `min(approvedAt + 24 months, kyc.documentExpiresAt)`; level 3 `approvedAt + 24 months`. Renewal opens 60 days before `expiresAt`.
- Cooldown after a rejection: 24 hours; 7 days when the reason is `fraud_suspected`.
- KYC: at most 3 sessions per request, at most 5 sessions per owner per rolling 30 days. Reference format `VR-{requestId}-{attempt}`.
- Documents: mime types `image/jpeg`, `image/png`, `image/webp`, `application/pdf`; size limit 10 MB; at most 10 per request; stored filename `{uuid}.{ext}`; no image sizes, crop or focal point.
- Signed document URL TTL: 60 seconds.
- Stale-claim release: 48 hours idle. Draft / `needs_info` expiry: 30 days.
- `business.legalName` 2–120 characters. `rccmNumber` / `entreprenantDeclarationNumber`: uppercase, spaces collapsed, 8–40 characters of `[A-Z0-9/.\- ]`. `niu`: uppercase, exactly 14 characters of `[A-Z0-9]`; a value not matching `^[A-Z]\d{12}[A-Z]$` adds the `niu_format` signal rather than refusing.
- Retention: document files 90 days after a non-fraud terminal status, 365 days after a fraud/forgery revocation, kept while `approved`; vendor-side data deleted 30 days after `kyc.decidedAt` and retried nightly until it succeeds; request rows stripped of names 5 years after a terminal status; `verification-document-views` 3 years; hashes of a deleted account 1 year after deletion.
- New env vars, all declared in the three compose files: `S3_PRIVATE_BUCKET`, `AZURE_STORAGE_PRIVATE_CONTAINER_NAME`, `PRIVATE_UPLOADS_DIR` (default `private-uploads/verification`), `VERIFICATION_HASH_PEPPER`, `VERIFICATION_ALLOW_UNAUTHORISED`, `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_WORKFLOW_ID`, `DIDIT_BASE_URL`.
- Every new UI string exists in French and English in the same commit. Seller messages typed by reviewers are free text and are not translated.

### The flag rule P1 paid for

`AppSettings.verification.enabled` **gates creation, never access to something that already exists.** P1 lost a fix round to a hook that gated its own query on `shops.enabled` and blanked every screen built on it. Concretely, in P2:

- The flag gates: opening a request, starting a KYC session, editing a business group, uploading a document, submitting. Those return 403 `verification.disabled`.
- The flag never gates: `GET /api/shops/{id}/verification` (it answers with `enabled: false` and the current state), `shopCapabilities`, `shops.level`, the `users.verified` virtual, any badge, the reviewer routes, the webhook, the purge job. A seller mid-flight when the flag is turned off must still see where they stand, and in-flight reviews must still finish.
- No Payload `access` function and no collection hook reads the flag. A flag read inside `access` turns a paused feature into a permission failure across every surface that touches the collection.

---

## Current state, re-verified 2026-09-30

The spec's `## Current state (verified 2026-09-15)` predates P1. Where reality has moved:

| Spec said | Reality at HEAD | Consequence for this plan |
|---|---|---|
| `ModerationLog` actions are listing/user/report; "P1 adds `shop.suspend\|unsuspend`" | Shipped, **plus** `listing.holdRelease`. `targetType` already has `shop`. `actor` is `required: true`; `liftExpiredShopSuspensions` writes `actorRole: "system"` with a real `actor` id | Task 2 adds the seven `verification.*` actions and `verification-request` to `targetType`, and relaxes `actor` to optional + `validate`. Existing writers keep passing an actor, so nothing regresses |
| "Web has no moderation screens" | Still true for the browser app. The Payload admin panel has `src/components/views/ModerationQueue*`, `ReportsQueue*`, `UserManagement*` and `widgets/ModerationWidget.tsx` | `/moderation/verification*` on `packages/web` is still the first browser moderation surface. The admin-panel widget/column changes in Task 18 are a separate surface |
| "Shared component `ShopLevelBadge`" | P1 already shipped `LevelBadge` on both clients (`packages/web/src/components/shop/level-badge.tsx`, `packages/mobile/src/components/shop/LevelBadge.tsx`), each with a comment reserving levels 2–3 for P2 | **Extend `LevelBadge`; do not create `ShopLevelBadge`.** A second badge component is the duplication `AGENTS.md` forbids |
| "`@aws-sdk/s3-request-presigner` is installed" | Present only transitively under `@payloadcms/storage-s3`; **not** a declared dependency of `packages/api` | Task 4 adds it to `packages/api/package.json` explicitly. Importing a transitive dependency is a hoisting accident waiting to break |
| "`plugins/storage.ts` builds a single adapter for `media` only" | Accurate. `buildStoragePlugin(): Promise<Plugin \| null>` | Task 4 changes the return type to `Plugin[]`, so `payload.config.ts` spreads it |
| "`media` has `read: () => true` and `create: authenticated`" | Accurate, **plus** P1's `hooks/mediaLimits.ts`: `beforeOperation` enforcing `ALLOWED_MEDIA_MIME_TYPES` (jpeg/png/webp) and `MAX_MEDIA_FILE_SIZE` (10 MB), answering `upload.invalidType` / `upload.tooLarge` | Task 3 generalises that hook into a factory rather than copying it |
| "Jobs: `expireListings`, `expireBoosts`, `checkSearchAlerts` on the `nightly` queue" | Also `liftExpiredShopSuspensions` (6 h) and `processWebhookEvent` | `purgeVerificationData` joins `nightly` |
| "mobile `filters.verified` exists but no code references it" | Still true — `filters.verified` is `"Vendeurs vérifiés uniquement"` / `"Verified sellers only"`, unreferenced | Task 32 wires it to `minShopLevel=2` |
| "No KYC code, no private storage, no verification collections" | Still true | — |
| "Errors are `{ code, message }`" (implied) | `errorResponse(code, status)` returns a **flat** `{ code, message }` body. Both clients' `normalizeApiError` handle that shape plus Payload's `errors[0]` shape | New codes go in `ERROR_CODES` + `FALLBACKS` in all three files |
| — (not in the spec) | `packages/mobile/src/lib/apiError.locales.test.ts` fails when a code lacks an entry in either locale, or when the two locales' `apiErrors` key sets differ | Tasks 27 keeps it passing. Task 20 adds the same guard to web, which the spec never asked for and which web can now run |
| "`packages/web` has no test harness" (P1's belief) | **Wrong now.** `packages/web/package.json` has `"test": "bun test"`, and `src/lib/*.test.ts` exists (`inventory.test.ts`, `query-keys.test.ts`, `phone-input.test.ts`, `phone-verification.test.ts`) | Every web task pins its pure logic under `src/lib` with a `bun test` file |
| — (not in the spec) | `packages/web/src/lib/query-keys.ts` exists with `catalogueRootKey` and `isKeyCoveredBy`, written after P1 lost a round to `productDetailKey` sitting outside every invalidation prefix | Task 20 nests every verification key under `shopScopeKey(shopId)` and extends `query-keys.test.ts` to prove the coverage |
| — (not in the spec) | `shops.level` exists, defaults to 1, is in `SHOP_SERVICE_FIELDS` and in `LISTING_VISIBLE_FIELDS` (so a level change already re-indexes the shop's listings through the `Shops.afterChange` hook). `writeShop(req, shopId, data)` is the single writer | Task 7 builds `setShopLevel` **on top of** `writeShop`; it must not write `shops.level` any other way, or the search re-index silently stops happening |
| — (not in the spec) | Meilisearch already has `shopLevel` filterable on the listings index and `level` filterable on the shops index | Task 19's `minShopLevel` needs **no** indexer settings change. It must still not regress `activeShopIds` hydration, which overrides a stale cached `shopLevel` per page |
| — (not in the spec) | `packages/api/src/lib/activeShopIds.ts` re-reads active shops per page of hits and `search/route.ts` prefers the live `activeShop?.level` over the indexed `doc.shopLevel` | A `minShopLevel` filter applied in Meilisearch can therefore return a hit whose live level is lower. Task 19 re-applies the floor after hydration |

---

## Review Focus

Five input classes the spec implies but no task's own happy path exercises, most likely to bite first. Each has its test pinned in the task that owns the code.

1. **The flag is turned off while a request is in review.** A seller reloads `/seller/verification`, a reviewer opens the queue. Expected: both keep working; only the write routes refuse. Pinned in Task 13 (`disabled keeps GET answering, refuses POST`) and Task 14 (`reviewer routes ignore the flag`).
2. **A vendor webhook arrives for a request that was already decided, revoked, or whose shop was closed.** Expected: the event is recorded, the job makes no transition, nothing throws, the job is not retried forever. Pinned in Task 11 (`a result for a terminal request is a no-op`).
3. **Two reviewers claim the same request in the same second.** Expected: exactly one wins, the loser gets 409 `verification.invalidTransition`, one `verification.claim` entry exists. Pinned in Task 14 (`claim race`).
4. **A document view is requested when the view log insert fails.** Expected: no URL is returned at all — a document is never shown unlazily off the record. Pinned in Task 15 (`a failing insert returns no URL`).
5. **A level-2 approval whose `kyc.documentExpiresAt` is in the past, or absent.** Expected: an already-expired document grants nothing (`expiresAt <= now`, so `shopCapabilities` reports level 1 immediately); an absent one falls back to 24 months. Pinned in Task 8 (`expiry is the earlier of the two, and a past document expiry grants no level`).

---

## File structure

### API (`packages/api/src`)

| File | Responsibility |
|---|---|
| `lib/shopCapabilities.ts` | **New.** `shopCapabilities(shop, now?)` — the single reader of what a level unlocks (pure) |
| `lib/verificationTransitions.ts` | **New.** The status machine and the log action per transition (pure) |
| `lib/verificationSignals.ts` | **New.** Name normalisation, token overlap, NIU format (pure) |
| `lib/verificationSettings.ts` | **New.** Reads `AppSettings.verification`, fails closed |
| `lib/verificationRetention.ts` | **New.** The retention periods, as data (pure) |
| `lib/privateFiles.ts` | **New.** `createSignedDocumentUrl(doc, ttlSeconds)` per provider; the local HMAC signature |
| `lib/hash.ts` | **New.** `peppered(value)` HMAC-SHA256 with `VERIFICATION_HASH_PEPPER`, `sha256(buffer)` |
| `lib/kyc/types.ts`, `lib/kyc/didit.ts`, `lib/kyc/index.ts` | **New.** `KycProvider` interface, the Didit adapter, the resolver |
| `lib/errors.ts` | Modify: fifteen `verification.*` codes + fallbacks |
| `hooks/mediaLimits.ts` | Modify: `enforceUploadLimits({ mimeTypes, maxBytes })` factory; `enforceMediaFileLimits` becomes one call of it |
| `collections/VerificationRequests.ts`, `VerificationDocuments.ts`, `VerificationDocumentViews.ts` | **New** |
| `collections/Shops.ts` | Modify: `levelExpiresAt`, `verifiedAt`, `legal` group; service-field list; `legal` pinning at level 3 |
| `collections/Users.ts` | Modify: `identityVerifiedAt`, `identityVerification`, `legacyVerifiedAt`; `verified` becomes virtual; `user-verified` trigger removed |
| `collections/ModerationLog.ts` | Modify: seven actions, `verification-request` target type, optional `actor` + `validate` |
| `collections/WebhookEvents.ts` | Modify: `didit` provider option |
| `globals/AppSettings.ts` | Modify: `verification` group + authorisation `validate` |
| `plugins/storage.ts` | Modify: returns `Plugin[]`; second private adapter; startup checks |
| `services/verification.ts` | **New.** Every write to the three collections, the verification fields on shops/users, and the log entries |
| `services/verificationDocuments.ts` | **New.** Upload, sha256, `duplicateOf`, delete, purge |
| `services/verificationNotifications.ts` | **New.** The five Novu triggers |
| `services/shops.ts` | Modify: `setShopLevel`, `onShopLevelChanged`, `shopLevelListeners` |
| `services/accountDeletion.ts` | Modify: purge documents, clear names, delete open requests |
| `jobs/processKycEvent.ts`, `jobs/purgeVerificationData.ts` | **New**; registered in `jobs/index.ts` and `payload.config.ts` |
| `migrations/20260930_000000_p2_verification_levels.ts` | **New**; registered in `migrations/index.ts` |
| `app/(frontend)/api/shops/[id]/verification/route.ts` | **New.** Seller read |
| `app/(frontend)/api/shops/[id]/verification-requests/route.ts` | **New.** Open a request |
| `app/(frontend)/api/verification-requests/[id]/{route,business,submit,kyc-session,documents}` | **New.** Seller writes |
| `app/(frontend)/api/moderation/verification/{route,[id]/route,documents/[docId]/view/route}` | **New.** Reviewer |
| `app/(frontend)/api/public/verification/webhook/[provider]/route.ts` | **New.** Vendor webhook |
| `app/(frontend)/api/verification/files/[docId]/route.ts` | **New.** Local-provider signed stream |
| `components/widgets/ModerationWidget.tsx`, `views/UserManagementClient.tsx`, `views/UserActions.tsx` | Modify: retire the `verified` checkbox surfaces |

### Web (`packages/web/src`) and mobile (`packages/mobile`)

Listed in the tasks that create them (Tasks 20–26 web, 27–33 mobile).

---

## API contracts

Shapes every client task relies on. `MediaRef` is P1's `{ id, url, thumbnailURL, alt }`.

```ts
type VerificationStatus =
  | "draft" | "submitted" | "in_review" | "needs_info"
  | "approved" | "rejected" | "revoked" | "expired";

type SignalCode =
  | "identity_reused" | "name_mismatch" | "underage" | "kyc_declined"
  | "kyc_review" | "document_reused" | "rccm_reused" | "niu_reused" | "niu_format";

type DocumentKind =
  | "rccm_extract" | "entreprenant_declaration" | "niu_certificate"
  | "legal_representative_id" | "mandate" | "proof_of_address" | "other";

type BusinessType = "entreprenant" | "sole_trader" | "company" | "cooperative";

interface ShopCapabilities {
  effectiveLevel: 0 | 1 | 2 | 3;
  badge: "phone" | "identity" | "business" | null;
  codOrders: boolean;
  protectedPayment: boolean;
  teamMembers: boolean;
  maxMembers: number;
  supplier: boolean;
  fasterPayouts: boolean;
  legalInfoVerified: boolean;
}

/** What the OWNER sees. Reviewer-only fields are absent, not null. */
interface OwnerVerificationRequest {
  id: string;
  requestedLevel: 2 | 3;
  status: VerificationStatus;
  consent: { acceptedAt: string; version: string; locale: "fr" | "en" } | null;
  kyc: {
    status: "not_started" | "pending" | "approved" | "declined" | "review" | "abandoned" | "error";
    attempts: number;
    documentType: "national_id" | "passport" | "residence_permit" | null;
    documentCountry: string | null;
    documentNumberLast4: string | null;
    documentExpiresAt: string | null;
    givenNames: string | null;
    familyName: string | null;
    livenessPassed: boolean;
  } | null;
  business: {
    businessType: BusinessType | null;
    legalName: string | null;
    tradeName: string | null;
    rccmNumber: string | null;
    entreprenantDeclarationNumber: string | null;
    niu: string | null;
    registeredAddress: string | null;
    city: string | null;
    legalRepresentativeName: string | null;
    legalRepresentativeIsOwner: boolean;
  } | null;
  documents: { id: string; kind: DocumentKind; originalFilename: string; mimeType: string; filesize: number; createdAt: string }[];
  infoRequests: { reasonCode: string; message: string; requestedAt: string; respondedAt: string | null }[];
  decision: { decidedAt: string; reasonCode: string | null; sellerMessage: string | null } | null;
  statusHistory: { status: VerificationStatus; at: string; source: "seller" | "reviewer" | "vendor" | "system" }[];
  submittedAt: string | null;
  approvedAt: string | null;
  expiresAt: string | null;
}

/** GET /api/shops/{id}/verification */
interface ShopVerificationResponse {
  enabled: boolean;                       // AppSettings.verification.enabled — drives entry points, NOT the read
  capabilities: ShopCapabilities;
  levelExpiresAt: string | null;
  consentVersion: string | null;          // AppSettings.verification.authorisation.consentVersion
  requests: { level2: OwnerVerificationRequest | null; level3: OwnerVerificationRequest | null };
  renewableFrom: { level2: string | null; level3: string | null };
  nextLevel: { level: 2 | 3; unlocks: Array<keyof ShopCapabilities>; eligible: boolean } | null;
  cooldownUntil: string | null;
}

/** GET /api/moderation/verification?queue=… — one row */
interface ReviewerQueueRow {
  id: string;
  requestedLevel: 2 | 3;
  status: VerificationStatus;
  shop: { id: string; handle: string; name: string; level: number };
  owner: { id: string; name: string };
  signals: SignalCode[];
  assignee: { id: string; name: string } | null;
  submittedAt: string | null;
  claimedAt: string | null;
  isResubmission: boolean;
}

/** GET /api/moderation/verification/{id} */
interface ReviewerRequestDetail {
  request: OwnerVerificationRequest & {
    reviewSignals: { code: SignalCode; detail: string | null; relatedRequest: string | null }[];
    assignee: { id: string; name: string } | null;
    claimedAt: string | null;
    kycInternal: { documentNumberHash: string; faceMatchScore: number | null; vendorWarnings: string[]; vendorReviewUrl: string | null } | null;
    decisionInternal: { internalNote: string | null; checklist: Record<string, boolean> | null } | null;
  };
  shop: { id: string; handle: string; name: string; level: number; status: string; legal: ShopLegal | null };
  owner: { id: string; name: string; avatar: MediaRef | null; phoneVerifiedAt: string | null; createdAt: string };
  otherRequests: { id: string; shopId: string; requestedLevel: 2 | 3; status: VerificationStatus; createdAt: string }[];
  history: { id: string; action: string; actorName: string | null; actorRole: string; reason: string | null; createdAt: string }[];
  /** The caller's own standing on this request — never inferred client-side from a value being present. */
  viewer: { canClaim: boolean; canDecide: boolean; isAssignee: boolean; isAdmin: boolean; conflictOfInterest: boolean };
}

interface ShopLegal {
  businessType: BusinessType | null;
  legalName: string | null;
  rccmNumber: string | null;
  niu: string | null;
  verifiedAt: string | null;
}

/** POST /api/moderation/verification/documents/{docId}/view */
interface SignedDocumentUrl { url: string; expiresAt: string; mimeType: string }
```

`GET /api/shops/{id}` and the seller-hub endpoints gain `capabilities: ShopCapabilities`. The public shop lookup (`PublicShop`) gains `badge` beside its existing `level`, and nothing else. **No client recomputes a capability from `level`.**

---

## Backend (Tasks 1–19)

### Task 1: Capabilities helper, error codes and the data-protection gate

**Files:**
- Create: `packages/api/src/lib/shopCapabilities.ts`
- Create: `packages/api/src/lib/verificationSettings.ts`
- Modify: `packages/api/src/lib/errors.ts`
- Modify: `packages/api/src/globals/AppSettings.ts`
- Modify: `docker-compose.yml`, `docker-compose.local.yml`, `docker-compose.atlas.yml`
- Test: `packages/api/tests/int/shop-capabilities.int.spec.ts`, `packages/api/tests/int/verification-settings.int.spec.ts`

**Interfaces:**
- Consumes: `ERROR_CODES` / `fallbackMessage` (`lib/errors.ts`), `getShopSettings` (`lib/shopSettings.ts`) as the pattern to copy.
- Produces:
  - `ShopCapabilities` and `shopCapabilities(shop: { status: string; level?: number | null; levelExpiresAt?: string | Date | null }, now?: Date): ShopCapabilities`
  - `CAPABILITY_UNLOCKS: Record<2 | 3, Array<keyof ShopCapabilities>>`
  - `VerificationSettings` and `getVerificationSettings(payload): Promise<VerificationSettings>`
  - `assertAuthorised(verification, env): string | null` (the message, or null when the gate passes)
  - Fifteen new `ERROR_CODES.verification*` entries.

- [ ] **Step 1: Write the failing capabilities test**

Create `packages/api/tests/int/shop-capabilities.int.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CAPABILITY_UNLOCKS, shopCapabilities } from "../../src/lib/shopCapabilities";

const NOW = new Date("2026-10-01T00:00:00.000Z");
const FUTURE = "2027-10-01T00:00:00.000Z";
const PAST = "2026-09-01T00:00:00.000Z";

describe("shopCapabilities", () => {
	it("gives an active level-1 shop COD only", () => {
		expect(shopCapabilities({ status: "active", level: 1 }, NOW)).toEqual({
			effectiveLevel: 1, badge: "phone", codOrders: true, protectedPayment: false,
			teamMembers: false, maxMembers: 1, supplier: false, fasterPayouts: false,
			legalInfoVerified: false,
		});
	});

	it("gives an active level-2 shop protected payment and a team of 5", () => {
		const caps = shopCapabilities({ status: "active", level: 2, levelExpiresAt: FUTURE }, NOW);
		expect(caps).toMatchObject({ effectiveLevel: 2, badge: "identity", protectedPayment: true, teamMembers: true, maxMembers: 5, supplier: false, legalInfoVerified: false });
	});

	it("gives an active level-3 shop the supplier flags and a team of 20", () => {
		const caps = shopCapabilities({ status: "active", level: 3, levelExpiresAt: FUTURE }, NOW);
		expect(caps).toMatchObject({ effectiveLevel: 3, badge: "business", supplier: true, fasterPayouts: true, legalInfoVerified: true, maxMembers: 20, protectedPayment: true });
	});

	it("drops to level 1 when levelExpiresAt has passed, with no job run", () => {
		for (const level of [2, 3]) {
			const caps = shopCapabilities({ status: "active", level, levelExpiresAt: PAST }, NOW);
			expect(caps).toMatchObject({ effectiveLevel: 1, badge: "phone", protectedPayment: false, teamMembers: false, maxMembers: 1 });
		}
	});

	it("treats a missing levelExpiresAt at level >= 2 as unexpired", () => {
		expect(shopCapabilities({ status: "active", level: 2 }, NOW).effectiveLevel).toBe(2);
	});

	it("empties every capability for a shop that is not active", () => {
		for (const status of ["suspended", "closed"]) {
			for (const level of [1, 2, 3]) {
				expect(shopCapabilities({ status, level, levelExpiresAt: FUTURE }, NOW)).toEqual({
					effectiveLevel: 0, badge: null, codOrders: false, protectedPayment: false,
					teamMembers: false, maxMembers: 1, supplier: false, fasterPayouts: false,
					legalInfoVerified: false,
				});
			}
		}
	});

	it("treats a missing or zero level on an active shop as level 1", () => {
		expect(shopCapabilities({ status: "active", level: 0 }, NOW).effectiveLevel).toBe(1);
		expect(shopCapabilities({ status: "active" }, NOW).effectiveLevel).toBe(1);
	});

	it("names exactly what each next level adds", () => {
		expect(CAPABILITY_UNLOCKS[2]).toEqual(["protectedPayment", "teamMembers"]);
		expect(CAPABILITY_UNLOCKS[3]).toEqual(["supplier", "fasterPayouts", "legalInfoVerified"]);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/shop-capabilities.int.spec.ts`
Expected: FAIL — cannot resolve `../../src/lib/shopCapabilities`.

- [ ] **Step 3: Write `lib/shopCapabilities.ts`**

```ts
/**
 * The single reader of what a shop's level unlocks. Every later phase calls
 * this and never compares `shop.level` itself — P4 adds its COD cap values
 * here keyed by `effectiveLevel`, P5 its payout rules, P3 its member cap.
 *
 * Expiry is a comparison at read time, not a flag a job sets, so a job that
 * has not run yet can never over-grant. Same reasoning as P1's
 * `suspensionSummary`.
 */
export interface ShopCapabilities {
	effectiveLevel: 0 | 1 | 2 | 3;
	badge: "phone" | "identity" | "business" | null;
	codOrders: boolean;
	protectedPayment: boolean;
	teamMembers: boolean;
	maxMembers: number;
	supplier: boolean;
	fasterPayouts: boolean;
	legalInfoVerified: boolean;
}

export interface CapabilityShop {
	status: string;
	level?: number | null;
	levelExpiresAt?: string | Date | null;
}

/** What a seller is told they gain by reaching the next level. */
export const CAPABILITY_UNLOCKS: Record<2 | 3, Array<keyof ShopCapabilities>> = {
	2: ["protectedPayment", "teamMembers"],
	3: ["supplier", "fasterPayouts", "legalInfoVerified"],
};

const EMPTY: ShopCapabilities = {
	effectiveLevel: 0,
	badge: null,
	codOrders: false,
	protectedPayment: false,
	teamMembers: false,
	maxMembers: 1,
	supplier: false,
	fasterPayouts: false,
	legalInfoVerified: false,
};

const BADGES = { 1: "phone", 2: "identity", 3: "business" } as const;

function expired(value: string | Date | null | undefined, now: Date): boolean {
	if (!value) return false;
	const at = value instanceof Date ? value.getTime() : Date.parse(value);
	return Number.isFinite(at) && at <= now.getTime();
}

export function shopCapabilities(shop: CapabilityShop, now = new Date()): ShopCapabilities {
	if (shop.status !== "active") return { ...EMPTY };

	const stored = Number(shop.level);
	let level: 1 | 2 | 3 = stored === 3 ? 3 : stored === 2 ? 2 : 1;
	if (level >= 2 && expired(shop.levelExpiresAt, now)) level = 1;

	return {
		effectiveLevel: level,
		badge: BADGES[level],
		codOrders: true,
		protectedPayment: level >= 2,
		teamMembers: level >= 2,
		maxMembers: level === 3 ? 20 : level === 2 ? 5 : 1,
		supplier: level >= 3,
		fasterPayouts: level >= 3,
		legalInfoVerified: level >= 3,
	};
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/shop-capabilities.int.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add the error codes**

In `packages/api/src/lib/errors.ts`, after the `// Shops and stock` block add:

```ts
	// Verification (P2)
	verificationDisabled: "verification.disabled",
	verificationNotOwner: "verification.notOwner",
	verificationLevelNotEligible: "verification.levelNotEligible",
	verificationRequestOpen: "verification.requestOpen",
	verificationCooldown: "verification.cooldown",
	verificationInvalidTransition: "verification.invalidTransition",
	verificationConsentRequired: "verification.consentRequired",
	verificationTooManyAttempts: "verification.tooManyAttempts",
	verificationKycUnavailable: "verification.kycUnavailable",
	verificationDocumentLimit: "verification.documentLimit",
	verificationDocumentsMissing: "verification.documentsMissing",
	verificationFieldsInvalid: "verification.fieldsInvalid",
	verificationNotAssignee: "verification.notAssignee",
	verificationConflictOfInterest: "verification.conflictOfInterest",
	verificationChecklistIncomplete: "verification.checklistIncomplete",
```

and to `FALLBACKS`:

```ts
	[ERROR_CODES.verificationDisabled]: "Verification is not available yet.",
	[ERROR_CODES.verificationNotOwner]: "Only the shop owner can do this.",
	[ERROR_CODES.verificationLevelNotEligible]:
		"Verify your identity before requesting business verification.",
	[ERROR_CODES.verificationRequestOpen]:
		"A request for this level is already open.",
	[ERROR_CODES.verificationCooldown]:
		"You cannot open a new request yet. Please try again later.",
	[ERROR_CODES.verificationInvalidTransition]:
		"This request is not in a state where that action applies.",
	[ERROR_CODES.verificationConsentRequired]:
		"Please accept the current data-protection notice to continue.",
	[ERROR_CODES.verificationTooManyAttempts]:
		"Too many verification attempts. Please try again later.",
	[ERROR_CODES.verificationKycUnavailable]:
		"Identity verification is unavailable right now. Please try again shortly.",
	[ERROR_CODES.verificationDocumentLimit]:
		"You have reached the maximum number of documents for this request.",
	[ERROR_CODES.verificationDocumentsMissing]:
		"Some required documents are still missing.",
	[ERROR_CODES.verificationFieldsInvalid]:
		"Please check the highlighted business details.",
	[ERROR_CODES.verificationNotAssignee]:
		"Only the reviewer who claimed this request can decide it.",
	[ERROR_CODES.verificationConflictOfInterest]:
		"You cannot review a shop you are involved with.",
	[ERROR_CODES.verificationChecklistIncomplete]:
		"Every checklist item must be confirmed before approving.",
```

- [ ] **Step 6: Write the failing settings-gate test**

Create `packages/api/tests/int/verification-settings.int.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertAuthorised, getVerificationSettings } from "../../src/lib/verificationSettings";
import { fakePayload } from "./helpers/fakePayload";

const GRANTED = {
	reference: "ANTIC-2026-0042",
	grantedAt: "2026-09-01T00:00:00.000Z",
	transfersAuthorised: true,
	consentVersion: "kyc-2026-10-v1",
};

describe("assertAuthorised", () => {
	it("passes when every authorisation field is recorded", () => {
		expect(assertAuthorised({ enabled: true, authorisation: GRANTED }, {})).toBeNull();
	});

	it("refuses enabling without a reference, a date, a consent version or the transfer tick", () => {
		for (const missing of ["reference", "grantedAt", "consentVersion"] as const) {
			const authorisation = { ...GRANTED, [missing]: "" };
			expect(assertAuthorised({ enabled: true, authorisation }, {})).toContain(missing);
		}
		expect(
			assertAuthorised({ enabled: true, authorisation: { ...GRANTED, transfersAuthorised: false } }, {}),
		).toContain("transfersAuthorised");
	});

	it("never refuses when the feature is being left off", () => {
		expect(assertAuthorised({ enabled: false, authorisation: {} }, {})).toBeNull();
	});

	it("lets staging bypass it, and ignores the bypass in production", () => {
		const env = { VERIFICATION_ALLOW_UNAUTHORISED: "true", NODE_ENV: "staging" };
		expect(assertAuthorised({ enabled: true, authorisation: {} }, env)).toBeNull();
		expect(
			assertAuthorised({ enabled: true, authorisation: {} }, { ...env, NODE_ENV: "production" }),
		).not.toBeNull();
	});
});

describe("getVerificationSettings", () => {
	it("reads the group", async () => {
		const payload = fakePayload({}, {
			globals: {
				"app-settings": {
					verification: { enabled: true, kycProvider: "didit", autoApproveIdentity: true, authorisation: GRANTED },
				},
			},
		});
		expect(await getVerificationSettings(payload)).toEqual({
			enabled: true,
			kycProvider: "didit",
			autoApproveIdentity: true,
			consentVersion: "kyc-2026-10-v1",
		});
	});

	it("fails closed when the global is unreadable", async () => {
		const payload = fakePayload({});
		payload.findGlobal = async () => { throw new Error("mongo down"); };
		expect(await getVerificationSettings(payload)).toEqual({
			enabled: false, kycProvider: "didit", autoApproveIdentity: false, consentVersion: null,
		});
	});
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-settings.int.spec.ts`
Expected: FAIL — cannot resolve `../../src/lib/verificationSettings`.

- [ ] **Step 8: Write `lib/verificationSettings.ts`**

```ts
import type { Payload } from "payload";

export interface VerificationSettings {
	enabled: boolean;
	kycProvider: "didit" | "smileid";
	autoApproveIdentity: boolean;
	consentVersion: string | null;
}

interface AuthorisationInput {
	reference?: unknown;
	grantedAt?: unknown;
	transfersAuthorised?: unknown;
	consentVersion?: unknown;
}

const filled = (value: unknown): boolean =>
	typeof value === "string" ? value.trim().length > 0 : Boolean(value);

/**
 * Law 2024/017: the feature cannot be switched on before the authorisation to
 * process and transfer identity data is recorded here. Returns the refusal
 * message, or null when the change is allowed.
 *
 * `env` is passed in rather than read from `process.env` so the production
 * rule is a test case, not a thing you have to believe.
 */
export function assertAuthorised(
	verification: { enabled?: unknown; authorisation?: AuthorisationInput },
	env: { VERIFICATION_ALLOW_UNAUTHORISED?: string; NODE_ENV?: string },
): string | null {
	if (verification.enabled !== true) return null;

	const bypass =
		env.VERIFICATION_ALLOW_UNAUTHORISED === "true" &&
		env.NODE_ENV !== "production";
	if (bypass) return null;

	const a = verification.authorisation ?? {};
	const missing = (["reference", "grantedAt", "consentVersion"] as const).filter(
		(key) => !filled(a[key]),
	);
	if (a.transfersAuthorised !== true) missing.push("transfersAuthorised" as never);
	if (missing.length === 0) return null;

	return `Verification cannot be enabled until the Law 2024/017 authorisation is recorded: missing ${missing.join(", ")}.`;
}

/** Fails closed: an unreadable settings global means verification stays off. */
export async function getVerificationSettings(
	payload: Payload,
): Promise<VerificationSettings> {
	try {
		const settings = await payload.findGlobal({
			slug: "app-settings",
			depth: 0,
			overrideAccess: true,
		});
		const v = (settings as { verification?: Record<string, unknown> }).verification;
		const provider = v?.kycProvider;
		const consent = (v?.authorisation as { consentVersion?: unknown } | undefined)?.consentVersion;
		return {
			enabled: v?.enabled === true,
			kycProvider: provider === "smileid" ? "smileid" : "didit",
			autoApproveIdentity: v?.autoApproveIdentity === true,
			consentVersion: typeof consent === "string" && consent ? consent : null,
		};
	} catch {
		return { enabled: false, kycProvider: "didit", autoApproveIdentity: false, consentVersion: null };
	}
}
```

- [ ] **Step 9: Add the `verification` group to `AppSettings`**

In `packages/api/src/globals/AppSettings.ts`, import the gate and add a global `beforeChange` hook plus the group after the `shops` group:

```ts
import { assertAuthorised } from "../lib/verificationSettings";
```

```ts
	hooks: {
		beforeChange: [
			({ data }) => {
				const refusal = assertAuthorised(
					(data as { verification?: Record<string, unknown> }).verification ?? {},
					process.env,
				);
				if (refusal) throw new Error(refusal);
				return data;
			},
		],
	},
```

```ts
		{
			name: "verification",
			type: "group",
			label: "Verification",
			fields: [
				{
					name: "enabled",
					type: "checkbox",
					label: "Allow verification requests",
					defaultValue: false,
					admin: {
						description:
							"Off: clients hide verification entry points and the seller write routes return verification.disabled. Existing requests stay readable, reviewers keep deciding, and the retention job keeps running.",
					},
				},
				{
					name: "kycProvider",
					type: "select",
					defaultValue: "didit",
					options: [
						{ label: "Didit", value: "didit" },
						{ label: "Smile ID", value: "smileid" },
					],
					required: true,
				},
				{
					name: "autoApproveIdentity",
					type: "checkbox",
					defaultValue: false,
					admin: {
						description:
							"Off at launch: every identity decision is taken by a person. On, a level-2 request the vendor approved with no review signal is approved automatically.",
					},
				},
				{
					name: "authorisation",
					type: "group",
					label: "Law 2024/017 authorisation",
					admin: {
						description:
							"Recorded in the processing register. Verification cannot be enabled until all four are set.",
					},
					fields: [
						{ name: "reference", type: "text" },
						{ name: "grantedAt", type: "date" },
						{ name: "transfersAuthorised", type: "checkbox", defaultValue: false },
						{
							name: "consentVersion",
							type: "text",
							admin: { description: 'The consent text version the clients must send back, e.g. "kyc-2026-10-v1".' },
						},
					],
				},
			],
		},
```

- [ ] **Step 10: Declare the env vars**

In each of `docker-compose.yml`, `docker-compose.local.yml` and `docker-compose.atlas.yml`, inside the `api` service `environment:` block, after the existing `# Storage` entries:

```yaml
      # Verification (P2)
      S3_PRIVATE_BUCKET: ${S3_PRIVATE_BUCKET:-}
      AZURE_STORAGE_PRIVATE_CONTAINER_NAME: ${AZURE_STORAGE_PRIVATE_CONTAINER_NAME:-}
      PRIVATE_UPLOADS_DIR: ${PRIVATE_UPLOADS_DIR:-private-uploads/verification}
      # Keys the document-number and IP hashes. Rotating it orphans every
      # existing hash, so duplicate detection restarts from that point.
      VERIFICATION_HASH_PEPPER: ${VERIFICATION_HASH_PEPPER:-}
      # Staging only: lets verification be enabled before the authorisation is
      # recorded. Ignored when NODE_ENV=production.
      VERIFICATION_ALLOW_UNAUTHORISED: ${VERIFICATION_ALLOW_UNAUTHORISED:-false}
      DIDIT_API_KEY: ${DIDIT_API_KEY:-}
      DIDIT_WEBHOOK_SECRET: ${DIDIT_WEBHOOK_SECRET:-}
      DIDIT_WORKFLOW_ID: ${DIDIT_WORKFLOW_ID:-}
      DIDIT_BASE_URL: ${DIDIT_BASE_URL:-https://verification.didit.me}
```

In `docker-compose.yml` only, add the private uploads volume to the `api` service so the local provider survives a restart: `- api_private_uploads:/app/packages/api/private-uploads`, and declare `api_private_uploads:` beside `api_media:` in the top-level `volumes:` block.

- [ ] **Step 11: Run every check**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/shop-capabilities.int.spec.ts tests/int/verification-settings.int.spec.ts && bun run check-types
cd /home/yvan/Workspaces/Projects/bns/bns-repo && bunx biome check --write packages/api/src/lib/shopCapabilities.ts packages/api/src/lib/verificationSettings.ts packages/api/src/lib/errors.ts packages/api/src/globals/AppSettings.ts packages/api/tests/int/shop-capabilities.int.spec.ts packages/api/tests/int/verification-settings.int.spec.ts
```

Expected: tests PASS, no type errors, Biome clean.

- [ ] **Step 12: Commit**

```bash
git add packages/api/src/lib/shopCapabilities.ts packages/api/src/lib/verificationSettings.ts packages/api/src/lib/errors.ts packages/api/src/globals/AppSettings.ts packages/api/tests/int/shop-capabilities.int.spec.ts packages/api/tests/int/verification-settings.int.spec.ts docker-compose.yml docker-compose.local.yml docker-compose.atlas.yml
git commit -m "feat(api): add shop capabilities, verification error codes and the data-protection gate"
```

---

### Task 2: `verification-requests` collection and the shop, user and log field additions

**Files:**
- Create: `packages/api/src/collections/VerificationRequests.ts`
- Modify: `packages/api/src/collections/ModerationLog.ts`, `Shops.ts`, `Users.ts`, `WebhookEvents.ts`
- Modify: `packages/api/src/payload.config.ts`
- Test: `packages/api/tests/int/verification-collections.int.spec.ts`

**Interfaces:**
- Consumes: `isAdmin` / `isModerator` (`access/roles.ts`), `staffOnlyField` / `nobody` (`access/staff.ts`), `SHOP_SERVICE_FIELDS` and `SHOP_SERVICE_CONTEXT` (`collections/Shops.ts`), `ERROR_CODES`, `CodedAPIError`.
- Produces:
  - `VerificationRequests` collection (`verification-requests`), `VERIFICATION_SERVICE_CONTEXT = { verificationService: true }`
  - `VERIFICATION_STATUSES`, `REVIEW_SIGNAL_CODES`, `BUSINESS_TYPES`, `REQUEST_INFO_REASONS`, `REJECT_REASONS`, `REVOKE_REASONS`, `LEVEL3_CHECKLIST_ITEMS` — all `as const` tuples exported from this file
  - `MODERATION_ACTIONS` gains the seven `verification.*` actions; `targetType` gains `verification-request`; `actor` becomes optional with a `validate`
  - `shops.levelExpiresAt`, `shops.verifiedAt`, `shops.legal` (`businessType`, `legalName`, `rccmNumber`, `niu`, `verifiedAt`)
  - `users.identityVerifiedAt`, `users.identityVerification`, `users.legacyVerifiedAt`

- [ ] **Step 1: Write the failing access test**

Create `packages/api/tests/int/verification-collections.int.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MODERATION_ACTIONS, ModerationLog } from "../../src/collections/ModerationLog";
import { Shops } from "../../src/collections/Shops";
import { Users } from "../../src/collections/Users";
import {
	LEVEL3_CHECKLIST_ITEMS,
	VERIFICATION_STATUSES,
	VerificationRequests,
} from "../../src/collections/VerificationRequests";

type Field = { name?: string; type?: string; fields?: Field[]; access?: { read?: unknown }; required?: boolean; validate?: unknown };

const field = (fields: Field[], name: string): Field | undefined =>
	fields.find((f) => f.name === name);

const OWNER = { req: { user: { id: "u-1", role: "user" } } };
const MOD = { req: { user: { id: "m-1", role: "moderator" } } };
const ADMIN = { req: { user: { id: "a-1", role: "admin" } } };

/**
 * The reviewer-only fields. P1 shipped a shaped endpoint that was correct
 * while Payload's generic REST beside it returned the same field, so this
 * asserts the field-level rule the generic route also obeys — not the shape
 * of any one handler.
 */
const REVIEWER_ONLY = [
	"reviewSignals", "assignee", "claimedAt",
] as const;

describe("verification-requests access", () => {
	it("is closed to every client for create, update and delete", () => {
		for (const op of ["create", "update", "delete"] as const) {
			const access = VerificationRequests.access?.[op];
			expect(typeof access).toBe("function");
			for (const ctx of [OWNER, MOD, ADMIN]) {
				expect((access as (a: unknown) => unknown)(ctx)).toBe(false);
			}
		}
	});

	it("lets a moderator read everything and an owner only their own shop's requests", () => {
		const read = VerificationRequests.access?.read as (a: unknown) => unknown;
		expect(read(MOD)).toBe(true);
		expect(read({ req: { user: null } })).toBe(false);
		expect(read(OWNER)).toEqual({ submittedBy: { equals: "u-1" } });
	});

	it("keeps every reviewer-only field unreadable to the owner", () => {
		const fields = VerificationRequests.fields as Field[];
		for (const name of REVIEWER_ONLY) {
			const read = field(fields, name)?.access?.read as ((a: unknown) => boolean) | undefined;
			expect(read, `${name} must declare a field-level read`).toBeTypeOf("function");
			expect(read?.(OWNER)).toBe(false);
			expect(read?.(MOD)).toBe(true);
		}
	});

	it("keeps the internal kyc and decision fields unreadable to the owner", () => {
		const fields = VerificationRequests.fields as Field[];
		const kyc = field(fields, "kyc")?.fields ?? [];
		for (const name of ["documentNumberHash", "faceMatchScore", "vendorWarnings", "vendorReviewUrl"]) {
			expect((field(kyc, name)?.access?.read as (a: unknown) => boolean)(OWNER)).toBe(false);
		}
		const decision = field(fields, "decision")?.fields ?? [];
		for (const name of ["internalNote", "checklist"]) {
			expect((field(decision, name)?.access?.read as (a: unknown) => boolean)(OWNER)).toBe(false);
		}
	});

	it("hides the collection from the admin panel for non-admins", () => {
		const hidden = VerificationRequests.admin?.hidden as ((a: unknown) => boolean) | boolean;
		expect(typeof hidden === "function" ? hidden({ user: { role: "moderator" } }) : hidden).toBe(true);
	});

	it("declares every status and checklist item the service machine uses", () => {
		expect(VERIFICATION_STATUSES).toEqual([
			"draft", "submitted", "in_review", "needs_info",
			"approved", "rejected", "revoked", "expired",
		]);
		expect(LEVEL3_CHECKLIST_ITEMS).toEqual([
			"name_matches_registry",
			"registration_number_matches_document",
			"niu_matches_certificate",
			"representative_matches_identity_or_mandate",
			"documents_legible_and_current",
		]);
	});
});

describe("moderation-log", () => {
	it("knows every verification action and the new target type", () => {
		for (const action of [
			"verification.claim", "verification.release", "verification.request_info",
			"verification.approve", "verification.reject", "verification.revoke", "verification.expire",
		]) {
			expect(MODERATION_ACTIONS).toContain(action);
		}
		const targetType = (ModerationLog.fields as Field[]).find((f) => f.name === "targetType") as { options: { value: string }[] };
		expect(targetType.options.map((o) => o.value)).toContain("verification-request");
	});

	it("requires an actor unless the entry is a system one", () => {
		const actor = (ModerationLog.fields as Field[]).find((f) => f.name === "actor");
		expect(actor?.required).toBeFalsy();
		const validate = actor?.validate as (v: unknown, o: { siblingData: { actorRole?: string } }) => true | string;
		expect(validate(null, { siblingData: { actorRole: "system" } })).toBe(true);
		expect(validate("u-1", { siblingData: { actorRole: "moderator" } })).toBe(true);
		expect(validate(null, { siblingData: { actorRole: "moderator" } })).toBeTypeOf("string");
	});
});

describe("shops and users field additions", () => {
	it("adds the service-owned level fields to shops and pins them", () => {
		const names = (Shops.fields as Field[]).map((f) => f.name);
		expect(names).toEqual(expect.arrayContaining(["levelExpiresAt", "verifiedAt", "legal"]));
		const legal = (Shops.fields as Field[]).find((f) => f.name === "legal")?.fields ?? [];
		expect(legal.map((f) => f.name)).toEqual([
			"businessType", "legalName", "rccmNumber", "niu", "verifiedAt",
		]);
	});

	it("adds the identity fields to users with the right readers", () => {
		const fields = Users.fields as Field[];
		expect(field(fields, "identityVerifiedAt")).toBeDefined();
		expect(field(fields, "identityVerification")).toBeDefined();
		const legacy = field(fields, "legacyVerifiedAt");
		expect((legacy?.access?.read as (a: unknown) => boolean)(MOD)).toBe(false);
		expect((legacy?.access?.read as (a: unknown) => boolean)(ADMIN)).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-collections.int.spec.ts`
Expected: FAIL — cannot resolve `../../src/collections/VerificationRequests`.

- [ ] **Step 3: Write `collections/VerificationRequests.ts`**

```ts
import type { Access, CollectionConfig, FieldAccess } from "payload";
import { isAdmin, isModerator } from "../access/roles";

export const VERIFICATION_SERVICE_CONTEXT = { verificationService: true } as const;

export const VERIFICATION_STATUSES = [
	"draft", "submitted", "in_review", "needs_info",
	"approved", "rejected", "revoked", "expired",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** A status where the request still occupies its shop+level slot. */
export const OPEN_STATUSES = ["draft", "submitted", "in_review", "needs_info"] as const;

export const KYC_STATUSES = [
	"not_started", "pending", "approved", "declined", "review", "abandoned", "error",
] as const;

export const REVIEW_SIGNAL_CODES = [
	"identity_reused", "name_mismatch", "underage", "kyc_declined", "kyc_review",
	"document_reused", "rccm_reused", "niu_reused", "niu_format",
] as const;
export type ReviewSignalCode = (typeof REVIEW_SIGNAL_CODES)[number];

export const BUSINESS_TYPES = ["entreprenant", "sole_trader", "company", "cooperative"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const REQUEST_INFO_REASONS = [
	"document_unreadable", "document_missing", "information_inconsistent", "kyc_retry", "other",
] as const;
export const REJECT_REASONS = [
	"document_invalid", "document_expired", "identity_mismatch", "liveness_failed",
	"business_mismatch", "duplicate_identity", "fraud_suspected", "other",
] as const;
export const REVOKE_REASONS = [
	"fraud", "document_forged", "business_closed", "identity_reused", "other",
] as const;

export const LEVEL3_CHECKLIST_ITEMS = [
	"name_matches_registry",
	"registration_number_matches_document",
	"niu_matches_certificate",
	"representative_matches_identity_or_mandate",
	"documents_legible_and_current",
] as const;

const options = <T extends readonly string[]>(values: T) =>
	values.map((value) => ({ label: value, value }));

/** Moderators and admins only. Declared per field so Payload's generic REST obeys it too. */
const reviewerField: FieldAccess = ({ req: { user } }) =>
	isModerator(user as { role?: string } | undefined);

const readAccess: Access = ({ req: { user } }) => {
	if (!user) return false;
	if (isModerator(user as { role?: string })) return true;
	// The owner is always the submitter: a shop's owner is the only account that
	// can open a request, and a transfer of ownership is out of P2's scope.
	return { submittedBy: { equals: user.id } };
};

const closed = () => false;

/**
 * Every write goes through services/verification.ts with `overrideAccess` and
 * `VERIFICATION_SERVICE_CONTEXT`. Nothing — not even an admin in the panel —
 * changes a status by hand, because a status change without its transaction
 * and its moderation-log entry is exactly the audit hole the log exists to
 * close.
 */
export const VerificationRequests: CollectionConfig = {
	slug: "verification-requests",
	admin: {
		useAsTitle: "openKey",
		defaultColumns: ["shop", "requestedLevel", "status", "assignee", "submittedAt"],
		hidden: ({ user }) => !isAdmin(user as { role?: string } | undefined),
	},
	access: { read: readAccess, create: closed, update: closed, delete: closed },
	indexes: [
		{ fields: ["status", "submittedAt"] },
		{ fields: ["shop", "requestedLevel", "status"] },
	],
	fields: [
		{ name: "shop", type: "relationship", relationTo: "shops", required: true, index: true },
		{
			name: "requestedLevel",
			type: "number",
			required: true,
			min: 2,
			max: 3,
			admin: { description: "2 = identity, 3 = business." },
		},
		{ name: "submittedBy", type: "relationship", relationTo: "users", required: true, index: true },
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "draft",
			index: true,
			options: options(VERIFICATION_STATUSES),
		},
		{
			name: "statusHistory",
			type: "array",
			fields: [
				{ name: "status", type: "select", required: true, options: options(VERIFICATION_STATUSES) },
				{ name: "at", type: "date", required: true },
				{ name: "actor", type: "relationship", relationTo: "users" },
				{
					name: "source",
					type: "select",
					required: true,
					options: options(["seller", "reviewer", "vendor", "system"] as const),
				},
			],
		},
		{
			/**
			 * `{shopId}:{level}` while the request is open, null otherwise. A
			 * partial unique index on the string values (created by the P2
			 * migration) is what makes "one open request per shop and level" a
			 * database invariant rather than a read-then-write race.
			 */
			name: "openKey",
			type: "text",
			index: true,
			admin: { readOnly: true },
		},
		{
			name: "consent",
			type: "group",
			fields: [
				{ name: "acceptedAt", type: "date" },
				{ name: "version", type: "text" },
				{ name: "locale", type: "select", options: options(["fr", "en"] as const) },
			],
		},
		{
			name: "kyc",
			type: "group",
			admin: { description: "Level 2 only. No biometric or image data is ever stored here." },
			fields: [
				{ name: "provider", type: "select", options: options(["didit", "smileid"] as const) },
				{ name: "sessionRef", type: "text", index: true },
				{ name: "status", type: "select", defaultValue: "not_started", options: options(KYC_STATUSES) },
				{ name: "attempts", type: "number", defaultValue: 0 },
				{ name: "decidedAt", type: "date" },
				{
					name: "documentType",
					type: "select",
					options: options(["national_id", "passport", "residence_permit"] as const),
				},
				{ name: "documentCountry", type: "text", maxLength: 2 },
				{
					// HMAC-SHA256 of the normalised number under VERIFICATION_HASH_PEPPER.
					// The number itself never reaches the database.
					name: "documentNumberHash",
					type: "text",
					index: true,
					access: { read: reviewerField },
				},
				{ name: "documentNumberLast4", type: "text", maxLength: 4 },
				{ name: "documentExpiresAt", type: "date" },
				{ name: "givenNames", type: "text" },
				{ name: "familyName", type: "text" },
				{
					// Derived from the date of birth, which is never stored.
					name: "adult",
					type: "checkbox",
					defaultValue: false,
				},
				{ name: "livenessPassed", type: "checkbox", defaultValue: false },
				{ name: "faceMatchScore", type: "number", min: 0, max: 100, access: { read: reviewerField } },
				{ name: "vendorWarnings", type: "json", access: { read: reviewerField } },
				{ name: "vendorReviewUrl", type: "text", access: { read: reviewerField } },
				{ name: "vendorDataDeletedAt", type: "date" },
			],
		},
		{
			name: "business",
			type: "group",
			admin: { description: "Level 3 only." },
			fields: [
				{ name: "businessType", type: "select", options: options(BUSINESS_TYPES) },
				{ name: "legalName", type: "text", maxLength: 120 },
				{ name: "tradeName", type: "text", maxLength: 120 },
				{ name: "rccmNumber", type: "text", maxLength: 40, index: true },
				{ name: "entreprenantDeclarationNumber", type: "text", maxLength: 40, index: true },
				{ name: "niu", type: "text", maxLength: 14, index: true },
				{ name: "registeredAddress", type: "textarea", maxLength: 500 },
				{ name: "city", type: "text", maxLength: 80 },
				{ name: "legalRepresentativeName", type: "text", maxLength: 120 },
				{ name: "legalRepresentativeIsOwner", type: "checkbox", defaultValue: true },
			],
		},
		{
			name: "documents",
			type: "join",
			collection: "verification-documents",
			on: "request",
		},
		{
			name: "reviewSignals",
			type: "array",
			access: { read: reviewerField },
			fields: [
				{ name: "code", type: "select", required: true, options: options(REVIEW_SIGNAL_CODES) },
				{ name: "detail", type: "text" },
				{ name: "relatedRequest", type: "relationship", relationTo: "verification-requests" },
			],
		},
		{
			name: "assignee",
			type: "relationship",
			relationTo: "users",
			index: true,
			access: { read: reviewerField },
		},
		{ name: "claimedAt", type: "date", access: { read: reviewerField } },
		{
			name: "infoRequests",
			type: "array",
			fields: [
				{ name: "reasonCode", type: "select", required: true, options: options(REQUEST_INFO_REASONS) },
				{ name: "message", type: "textarea", required: true },
				{ name: "requestedBy", type: "relationship", relationTo: "users", access: { read: reviewerField } },
				{ name: "requestedAt", type: "date", required: true },
				{ name: "respondedAt", type: "date" },
			],
		},
		{
			name: "decision",
			type: "group",
			fields: [
				{ name: "decidedBy", type: "relationship", relationTo: "users", access: { read: reviewerField } },
				{ name: "decidedAt", type: "date" },
				{ name: "reasonCode", type: "text" },
				{ name: "sellerMessage", type: "textarea" },
				{ name: "internalNote", type: "textarea", access: { read: reviewerField } },
				{ name: "checklist", type: "json", access: { read: reviewerField } },
			],
		},
		{ name: "submittedAt", type: "date", index: true },
		{ name: "approvedAt", type: "date" },
		{ name: "expiresAt", type: "date", index: true },
		{ name: "revokedAt", type: "date" },
		{ name: "supersedes", type: "relationship", relationTo: "verification-requests" },
		{ name: "previousRequest", type: "relationship", relationTo: "verification-requests" },
	],
	timestamps: true,
};
```

- [ ] **Step 4: Extend `ModerationLog`**

In `packages/api/src/collections/ModerationLog.ts`, add the seven actions after `"shop.unsuspend",`:

```ts
	"verification.claim",
	"verification.release",
	"verification.request_info",
	"verification.approve",
	"verification.reject",
	"verification.revoke",
	"verification.expire",
```

add `{ label: "Verification request", value: "verification-request" },` to the `targetType` options, and replace the `actor` field with:

```ts
		{
			/**
			 * Optional only for system entries: scheduled expiry of a draft
			 * request and a stale-claim release have no human behind them, and
			 * `actorRole: "system"` is what the entry means. Every human action
			 * still fails validation without an actor, so an action cannot be
			 * taken anonymously by leaving the field out.
			 */
			name: "actor",
			type: "relationship",
			relationTo: "users",
			index: true,
			admin: { readOnly: true },
			validate: (value: unknown, { siblingData }: { siblingData: { actorRole?: string } }) =>
				value || siblingData?.actorRole === "system"
					? true
					: "An actor is required unless the entry is a system entry.",
		},
```

- [ ] **Step 5: Extend `Shops`**

In `packages/api/src/collections/Shops.ts`:

1. Add `"levelExpiresAt"`, `"verifiedAt"` to `SHOP_SERVICE_FIELDS` (after `"level"`).
2. Add the fields after `level`:

```ts
		{
			name: "levelExpiresAt",
			type: "date",
			index: true,
			admin: {
				readOnly: true,
				position: "sidebar",
				description:
					"Earliest expiry among the requests backing the current level. Read through shopCapabilities, which compares it at read time — never trust a job to have lowered `level` already.",
			},
		},
		{
			name: "verifiedAt",
			type: "date",
			admin: { readOnly: true, position: "sidebar", description: "When level 2 was first reached." },
		},
		{
			/**
			 * Declared by the shop until level 3, reviewed at level 3. The whole
			 * group is public: it is what a buyer needs to know who they are
			 * dealing with, labelled "declared" until `verifiedAt` is set.
			 */
			name: "legal",
			type: "group",
			fields: [
				{ name: "businessType", type: "select", options: BUSINESS_TYPES.map((value) => ({ label: value, value })) },
				{ name: "legalName", type: "text", maxLength: 120 },
				{ name: "rccmNumber", type: "text", maxLength: 40 },
				{ name: "niu", type: "text", maxLength: 14 },
				{ name: "verifiedAt", type: "date", admin: { readOnly: true } },
			],
		},
```

with `import { BUSINESS_TYPES } from "./VerificationRequests";` at the top.

3. In the `beforeChange` hook, after the `SHOP_SERVICE_FIELDS` loop, pin `legal` once level 3 is effective and pin `legal.verifiedAt` always:

```ts
				// `legal` is owner-editable while the shop is below level 3 and is
				// shown as "declared". Once level 3 is effective it is reviewed
				// content: changing it needs a new level-3 request.
				if ((originalDoc?.level ?? 1) >= 3) {
					data.legal = originalDoc?.legal;
				} else if (data.legal && typeof data.legal === "object") {
					(data.legal as Record<string, unknown>).verifiedAt =
						(originalDoc?.legal as { verifiedAt?: unknown } | undefined)?.verifiedAt ?? null;
				}
```

4. Add `"legal"` to `LISTING_VISIBLE_FIELDS`? **No** — a legal-block change does not affect a listing card. Add `"levelExpiresAt"` to it instead, so a level that expires re-indexes the shop's listings:

```ts
const LISTING_VISIBLE_FIELDS = ["name", "handle", "status", "level", "levelExpiresAt"] as const;
```

- [ ] **Step 6: Extend `Users`**

In `packages/api/src/collections/Users.ts`, add after the `verified` checkbox (which Task 5 replaces):

```ts
		{
			name: "identityVerifiedAt",
			type: "date",
			access: { read: selfOrStaffField },
			admin: {
				readOnly: true,
				position: "sidebar",
				description:
					"Set when a level-2 request is approved, cleared on revoke or expiry. Written only by services/verification.ts.",
			},
		},
		{
			name: "identityVerification",
			type: "relationship",
			relationTo: "verification-requests",
			access: { read: staffOnlyField },
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			// Filled by the P2 migration from the retired `verified` checkbox, so
			// the fact that an admin had once ticked it is not lost. It grants
			// nothing: the checkbox never checked anything.
			name: "legacyVerifiedAt",
			type: "date",
			access: { read: ({ req: { user } }) => isAdmin(user as { role?: string } | undefined) },
			admin: { readOnly: true, hidden: true },
		},
```

with `import { isAdmin } from "../access/roles";` and `staffOnlyField` added to the existing `../access/staff` import.

Add `identityVerifiedAt`, `identityVerification` and `legacyVerifiedAt` to the non-admin pinning block inside `beforeChange`'s `operation === "update"` branch, under the same `!isModerationWrite` style guard but keyed on the verification service:

```ts
					const isVerificationWrite = req.context?.verificationService === true;
					if (!isVerificationWrite) {
						data.identityVerifiedAt = originalDoc?.identityVerifiedAt;
						data.identityVerification = originalDoc?.identityVerification;
						data.legacyVerifiedAt = originalDoc?.legacyVerifiedAt;
					}
```

Pinned for admins too, for the same reason the suspension fields are: a level granted from the panel would bypass the log.

- [ ] **Step 7: Add the `didit` webhook provider**

In `packages/api/src/collections/WebhookEvents.ts`, add `{ label: "Didit", value: "didit" },` to the `provider` options.

- [ ] **Step 8: Register the collection**

In `packages/api/src/payload.config.ts`, import `VerificationRequests` and add it to the `collections` array after `Shops`-related entries.

- [ ] **Step 9: Run the test and regenerate types**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-collections.int.spec.ts
cd packages/api && bun run generate:types && bun run check-types
```

Expected: test PASS; `payload-types.ts` gains `VerificationRequest` and the new shop/user fields.

- [ ] **Step 10: Re-run the P1 suites that touch these collections**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/shop-moderation.int.spec.ts tests/int/shops.int.spec.ts`
Expected: PASS. The relaxed `actor` and the new shop fields must not have moved anything. If `shop-moderation` fails on a `legal` pin, the P1 moderation writes carry `shopService: true`, which the new pin ignores — re-read Step 5.3.

- [ ] **Step 11: Commit**

```bash
git add packages/api/src/collections/VerificationRequests.ts packages/api/src/collections/ModerationLog.ts packages/api/src/collections/Shops.ts packages/api/src/collections/Users.ts packages/api/src/collections/WebhookEvents.ts packages/api/src/payload.config.ts packages/api/src/payload-types.ts packages/api/tests/int/verification-collections.int.spec.ts
git commit -m "feat(api): add the verification-requests collection and the shop, user and log fields it needs"
```

---

### Task 3: `verification-documents`, the view log, and shared upload limits

**Files:**
- Create: `packages/api/src/collections/VerificationDocuments.ts`, `VerificationDocumentViews.ts`
- Create: `packages/api/src/lib/hash.ts`
- Modify: `packages/api/src/hooks/mediaLimits.ts`, `packages/api/src/collections/Media.ts`, `packages/api/src/payload.config.ts`
- Test: `packages/api/tests/int/verification-documents.int.spec.ts`, `packages/api/tests/int/media-limits.int.spec.ts` (extend if it exists, create otherwise)

**Interfaces:**
- Consumes: `ERROR_CODES`, `CodedAPIError`, `nobody` (`access/staff.ts`), `isAdmin`.
- Produces:
  - `enforceUploadLimits(options: { mimeTypes: readonly string[]; maxBytes: number }): CollectionBeforeOperationHook` in `hooks/mediaLimits.ts`; `enforceMediaFileLimits` stays exported and becomes one call of it
  - `VERIFICATION_MIME_TYPES`, `MAX_VERIFICATION_FILE_SIZE`, `MAX_DOCUMENTS_PER_REQUEST = 10`, `DOCUMENT_KINDS`
  - `VerificationDocuments` (`verification-documents`), `VerificationDocumentViews` (`verification-document-views`)
  - `sha256(data: Buffer | Uint8Array | string): string` and `peppered(value: string): string` in `lib/hash.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/int/verification-documents.int.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { VerificationDocumentViews } from "../../src/collections/VerificationDocumentViews";
import {
	DOCUMENT_KINDS,
	MAX_DOCUMENTS_PER_REQUEST,
	MAX_VERIFICATION_FILE_SIZE,
	VERIFICATION_MIME_TYPES,
	VerificationDocuments,
} from "../../src/collections/VerificationDocuments";
import { enforceUploadLimits } from "../../src/hooks/mediaLimits";
import { peppered, sha256 } from "../../src/lib/hash";

const ADMIN = { req: { user: { id: "a-1", role: "admin" } } };
const MOD = { req: { user: { id: "m-1", role: "moderator" } } };
const OWNER = { req: { user: { id: "u-1", role: "user" } } };

describe("verification-documents access", () => {
	it("refuses every operation to everyone, admins included", () => {
		for (const op of ["read", "create", "update", "delete"] as const) {
			const access = VerificationDocuments.access?.[op] as (a: unknown) => unknown;
			for (const ctx of [OWNER, MOD, ADMIN]) expect(access(ctx)).toBe(false);
		}
	});

	it("is hidden from the admin panel", () => {
		expect(VerificationDocuments.admin?.hidden).toBe(true);
	});

	it("takes PDFs as well as the three image types, at 10 MB", () => {
		expect([...VERIFICATION_MIME_TYPES]).toEqual([
			"image/jpeg", "image/png", "image/webp", "application/pdf",
		]);
		expect(MAX_VERIFICATION_FILE_SIZE).toBe(10 * 1024 * 1024);
		expect(MAX_DOCUMENTS_PER_REQUEST).toBe(10);
		expect([...DOCUMENT_KINDS]).toEqual([
			"rccm_extract", "entreprenant_declaration", "niu_certificate",
			"legal_representative_id", "mandate", "proof_of_address", "other",
		]);
	});

	it("keeps no image sizes, crop or focal point", () => {
		expect(VerificationDocuments.upload).toMatchObject({
			imageSizes: [], crop: false, focalPoint: false, disableLocalStorage: false,
		});
	});
});

describe("verification-document-views access", () => {
	it("is readable by admins only and never writable", () => {
		const read = VerificationDocumentViews.access?.read as (a: unknown) => unknown;
		expect(read(ADMIN)).toBe(true);
		expect(read(MOD)).toBe(false);
		for (const op of ["create", "update", "delete"] as const) {
			expect((VerificationDocumentViews.access?.[op] as (a: unknown) => unknown)(ADMIN)).toBe(false);
		}
	});
});

describe("enforceUploadLimits", () => {
	const hook = enforceUploadLimits({ mimeTypes: ["application/pdf"], maxBytes: 100 });
	const run = (file: { mimetype: string; size: number } | undefined) =>
		(hook as (a: { operation: string; req: { file?: unknown } }) => unknown)({ operation: "create", req: { file } });

	it("refuses a type outside the list with upload.invalidType", () => {
		expect(() => run({ mimetype: "image/gif", size: 10 })).toThrow(
			expect.objectContaining({ code: "upload.invalidType" }),
		);
	});

	it("refuses a file over the limit with upload.tooLarge", () => {
		expect(() => run({ mimetype: "application/pdf", size: 101 })).toThrow(
			expect.objectContaining({ code: "upload.tooLarge" }),
		);
	});

	it("lets an allowed file through and ignores an operation with no file", () => {
		expect(() => run({ mimetype: "application/pdf", size: 100 })).not.toThrow();
		expect(() => run(undefined)).not.toThrow();
	});
});

describe("hash helpers", () => {
	it("hashes deterministically and differently per input", () => {
		expect(sha256("abc")).toBe(sha256("abc"));
		expect(sha256("abc")).not.toBe(sha256("abd"));
		expect(sha256("abc")).toMatch(/^[0-9a-f]{64}$/);
	});

	it("peppers with the configured secret, so the same input differs across peppers", () => {
		process.env.VERIFICATION_HASH_PEPPER = "pepper-a";
		const a = peppered("123456789");
		process.env.VERIFICATION_HASH_PEPPER = "pepper-b";
		expect(peppered("123456789")).not.toBe(a);
	});

	it("refuses to hash without a pepper, rather than hashing with an empty key", () => {
		process.env.VERIFICATION_HASH_PEPPER = "";
		expect(() => peppered("123456789")).toThrow(/VERIFICATION_HASH_PEPPER/);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-documents.int.spec.ts`
Expected: FAIL — cannot resolve the new modules.

- [ ] **Step 3: Write `lib/hash.ts`**

```ts
import { createHash, createHmac } from "node:crypto";

export function sha256(data: Buffer | Uint8Array | string): string {
	return createHash("sha256").update(data).digest("hex");
}

/**
 * Keyed hash for values that must be comparable but never recoverable: the
 * identity-document number and a reviewer's IP. An unkeyed SHA-256 of a
 * 9-digit CNI number is brute-forceable in seconds, so the pepper is what
 * makes the stored value useless to anyone who takes the database.
 *
 * Throwing on an empty pepper is deliberate: hashing with an empty key would
 * produce something that looks right and protects nothing.
 */
export function peppered(value: string): string {
	const pepper = process.env.VERIFICATION_HASH_PEPPER ?? "";
	if (!pepper) {
		throw new Error("VERIFICATION_HASH_PEPPER is not set; refusing to hash with an empty key");
	}
	return createHmac("sha256", pepper).update(value).digest("hex");
}
```

- [ ] **Step 4: Generalise `hooks/mediaLimits.ts`**

Replace the body of `enforceMediaFileLimits` with a factory, keeping both named exports and the existing comments:

```ts
import type { CollectionBeforeOperationHook } from "payload";
import { ERROR_CODES } from "../lib/errors";
import { CodedAPIError } from "../lib/serviceError";

export const ALLOWED_MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_MEDIA_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Runs before Payload's own field validation, for both the REST upload path
 * and the local API, so a disallowed type or an oversized file never reaches
 * the database either way. `req.file` is absent on an update that does not
 * replace the file, which is not this hook's concern.
 *
 * Parameterised because `verification-documents` has the same rule with a
 * different list (PDFs included) and must answer with the same two codes.
 */
export function enforceUploadLimits(options: {
	mimeTypes: readonly string[];
	maxBytes: number;
}): CollectionBeforeOperationHook {
	return ({ operation, req }) => {
		if (operation !== "create" && operation !== "update") return;
		const file = req.file;
		if (!file) return;
		if (!options.mimeTypes.includes(file.mimetype)) {
			throw new CodedAPIError(ERROR_CODES.uploadInvalidType, 400);
		}
		if (file.size > options.maxBytes) {
			throw new CodedAPIError(ERROR_CODES.uploadTooLarge, 413);
		}
	};
}

export const enforceMediaFileLimits = enforceUploadLimits({
	mimeTypes: ALLOWED_MEDIA_MIME_TYPES,
	maxBytes: MAX_MEDIA_FILE_SIZE,
});
```

`collections/Media.ts` needs no change: it already imports `enforceMediaFileLimits`.

- [ ] **Step 5: Write `collections/VerificationDocuments.ts`**

```ts
import path from "node:path";
import type { CollectionConfig } from "payload";
import { isAdmin } from "../access/roles";
import { enforceUploadLimits } from "../hooks/mediaLimits";

export const VERIFICATION_MIME_TYPES = [
	"image/jpeg", "image/png", "image/webp", "application/pdf",
] as const;
export const MAX_VERIFICATION_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_REQUEST = 10;

export const DOCUMENT_KINDS = [
	"rccm_extract", "entreprenant_declaration", "niu_certificate",
	"legal_representative_id", "mandate", "proof_of_address", "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

const closed = () => false;

/**
 * Stored only through the private storage configuration (plugins/storage.ts).
 *
 * Every access rule is closed, for admins too, so Payload's own file route
 * `/api/verification-documents/file/*` always answers 403. The single way to
 * see a document is the signed-URL route, which writes a
 * `verification-document-views` row before it hands the URL back — "every look
 * at an identity document is on the record" is only true if there is no second
 * door.
 */
export const VerificationDocuments: CollectionConfig = {
	slug: "verification-documents",
	admin: { hidden: true, useAsTitle: "originalFilename" },
	access: { read: closed, create: closed, update: closed, delete: closed },
	hooks: {
		beforeOperation: [
			enforceUploadLimits({
				mimeTypes: VERIFICATION_MIME_TYPES,
				maxBytes: MAX_VERIFICATION_FILE_SIZE,
			}),
		],
	},
	fields: [
		{ name: "request", type: "relationship", relationTo: "verification-requests", required: true, index: true },
		{ name: "shop", type: "relationship", relationTo: "shops", required: true, index: true },
		{ name: "kind", type: "select", required: true, options: DOCUMENT_KINDS.map((value) => ({ label: value, value })) },
		{ name: "sha256", type: "text", index: true },
		{
			// The stored `filename` is `{uuid}.{ext}`: a seller's own filename can
			// carry their name, and a filename is the one part of an upload that
			// ends up in a URL.
			name: "originalFilename",
			type: "text",
		},
		{ name: "uploadedBy", type: "relationship", relationTo: "users" },
		{ name: "duplicateOf", type: "relationship", relationTo: "verification-documents", hasMany: true },
		{ name: "purgedAt", type: "date", index: true },
	],
	upload: {
		staticDir: path.resolve(
			process.cwd(),
			process.env.PRIVATE_UPLOADS_DIR ?? "private-uploads/verification",
		),
		mimeTypes: [...VERIFICATION_MIME_TYPES],
		imageSizes: [],
		crop: false,
		focalPoint: false,
		disableLocalStorage: false,
	},
	timestamps: true,
};

/** Append-only. Written only by the signed-URL route, in the same call that mints the URL. */
export const verificationDocumentsIsAdminOnly = isAdmin;
```

- [ ] **Step 6: Write `collections/VerificationDocumentViews.ts`**

```ts
import type { CollectionConfig } from "payload";
import { isAdmin } from "../access/roles";

const closed = () => false;

/**
 * Append-only audit of every look at an identity document. Readable by admins
 * only — a moderator reading the log would be reading which of their
 * colleagues looked at what, which is not what this record is for.
 */
export const VerificationDocumentViews: CollectionConfig = {
	slug: "verification-document-views",
	admin: {
		useAsTitle: "createdAt",
		defaultColumns: ["document", "viewer", "viewerRole", "createdAt"],
		hidden: ({ user }) => !isAdmin(user as { role?: string } | undefined),
	},
	access: {
		read: ({ req: { user } }) => isAdmin(user as { role?: string } | undefined),
		create: closed,
		update: closed,
		delete: closed,
	},
	fields: [
		{ name: "document", type: "relationship", relationTo: "verification-documents", required: true, index: true },
		{ name: "request", type: "relationship", relationTo: "verification-requests", required: true, index: true },
		{ name: "viewer", type: "relationship", relationTo: "users", required: true, index: true },
		{ name: "viewerRole", type: "text" },
		{ name: "ipHash", type: "text" },
		{ name: "userAgent", type: "text", maxLength: 200 },
	],
	timestamps: true,
};
```

- [ ] **Step 7: Register both collections**

Add both to the `collections` array in `packages/api/src/payload.config.ts`, after `VerificationRequests`.

- [ ] **Step 8: Verify and regenerate**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-documents.int.spec.ts
cd packages/api && bun run generate:types && bun run check-types
```

Expected: PASS.

- [ ] **Step 9: Prove the media path did not regress**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/` and compare the failure list against the five known-failing files. Expected: no new failures.

- [ ] **Step 10: Commit**

```bash
git add packages/api/src/collections/VerificationDocuments.ts packages/api/src/collections/VerificationDocumentViews.ts packages/api/src/lib/hash.ts packages/api/src/hooks/mediaLimits.ts packages/api/src/payload.config.ts packages/api/src/payload-types.ts packages/api/tests/int/verification-documents.int.spec.ts
git commit -m "feat(api): add private verification document collections and a shared upload-limit factory"
```

---

### Task 4: Private storage adapter, signed URLs and the local file route

**Files:**
- Modify: `packages/api/src/plugins/storage.ts`, `packages/api/src/payload.config.ts`, `packages/api/package.json`
- Create: `packages/api/src/lib/privateFiles.ts`
- Create: `packages/api/src/app/(frontend)/api/verification/files/[docId]/route.ts`
- Test: `packages/api/tests/int/private-storage.int.spec.ts`

**Interfaces:**
- Consumes: `VerificationDocuments` (Task 3), `ERROR_CODES`, `errorResponse`.
- Produces:
  - `buildStoragePlugins(): Promise<Plugin[]>` (replaces `buildStoragePlugin`)
  - `assertPrivateStorageConfig(env): string | null` — the refusal message, or null
  - `createSignedDocumentUrl(doc: PrivateDoc, ttlSeconds?: number): Promise<{ url: string; expiresAt: Date }>` where `PrivateDoc = { id: string; filename: string; mimeType?: string | null; prefix?: string | null }`
  - `signLocalFileToken(docId: string, expiresAtMs: number): string` and `verifyLocalFileToken(docId, exp, sig): boolean`
  - `GET /api/verification/files/{docId}?exp=&sig=`

- [ ] **Step 1: Add the presigner dependency**

`@aws-sdk/s3-request-presigner` is currently only a transitive dependency of `@payloadcms/storage-s3`. Add it explicitly:

```bash
cd packages/api && bun add @aws-sdk/s3-request-presigner@^3
```

Expected: `packages/api/package.json` gains the dependency and `bun.lock` updates.

- [ ] **Step 2: Write the failing test**

Create `packages/api/tests/int/private-storage.int.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	signLocalFileToken,
	verifyLocalFileToken,
} from "../../src/lib/privateFiles";
import { assertPrivateStorageConfig } from "../../src/plugins/storage";

describe("assertPrivateStorageConfig", () => {
	it("passes for S3 with a distinct private bucket", () => {
		expect(assertPrivateStorageConfig({
			STORAGE_PROVIDER: "s3", S3_BUCKET: "bns-media", S3_PRIVATE_BUCKET: "bns-private",
		})).toBeNull();
	});

	it("refuses an empty private bucket", () => {
		expect(assertPrivateStorageConfig({
			STORAGE_PROVIDER: "s3", S3_BUCKET: "bns-media", S3_PRIVATE_BUCKET: "",
		})).toContain("S3_PRIVATE_BUCKET");
	});

	it("refuses a private bucket equal to the public one", () => {
		expect(assertPrivateStorageConfig({
			STORAGE_PROVIDER: "s3", S3_BUCKET: "bns-media", S3_PRIVATE_BUCKET: "bns-media",
		})).toContain("same bucket");
	});

	it("refuses an empty private container on Azure", () => {
		expect(assertPrivateStorageConfig({
			STORAGE_PROVIDER: "azure",
			AZURE_STORAGE_CONTAINER_NAME: "media",
			AZURE_STORAGE_PRIVATE_CONTAINER_NAME: "",
		})).toContain("AZURE_STORAGE_PRIVATE_CONTAINER_NAME");
	});

	it("refuses the local provider in production and allows it elsewhere", () => {
		expect(assertPrivateStorageConfig({ STORAGE_PROVIDER: "local", NODE_ENV: "production" }))
			.toContain("local");
		expect(assertPrivateStorageConfig({ STORAGE_PROVIDER: "local", NODE_ENV: "development" }))
			.toBeNull();
	});
});

describe("local signed file tokens", () => {
	const originalSecret = process.env.PAYLOAD_SECRET;
	process.env.PAYLOAD_SECRET = "test-secret";

	it("accepts its own signature before the deadline", () => {
		const exp = Date.now() + 60_000;
		expect(verifyLocalFileToken("doc-1", exp, signLocalFileToken("doc-1", exp))).toBe(true);
	});

	it("refuses an expired token", () => {
		const exp = Date.now() - 1;
		expect(verifyLocalFileToken("doc-1", exp, signLocalFileToken("doc-1", exp))).toBe(false);
	});

	it("refuses a signature minted for another document", () => {
		const exp = Date.now() + 60_000;
		expect(verifyLocalFileToken("doc-2", exp, signLocalFileToken("doc-1", exp))).toBe(false);
	});

	it("refuses a tampered deadline", () => {
		const exp = Date.now() + 60_000;
		const sig = signLocalFileToken("doc-1", exp);
		expect(verifyLocalFileToken("doc-1", exp + 60_000, sig)).toBe(false);
	});

	it("refuses a malformed signature without throwing", () => {
		expect(verifyLocalFileToken("doc-1", Date.now() + 60_000, "nonsense")).toBe(false);
		expect(verifyLocalFileToken("doc-1", Number.NaN, "")).toBe(false);
	});

	process.env.PAYLOAD_SECRET = originalSecret;
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/private-storage.int.spec.ts`
Expected: FAIL — `assertPrivateStorageConfig` is not exported.

- [ ] **Step 4: Rewrite `plugins/storage.ts`**

```ts
import type { Plugin } from "payload";

type StorageProvider = "s3" | "azure" | "local";

interface StorageEnv {
	STORAGE_PROVIDER?: string;
	S3_BUCKET?: string;
	S3_PRIVATE_BUCKET?: string;
	AZURE_STORAGE_CONTAINER_NAME?: string;
	AZURE_STORAGE_PRIVATE_CONTAINER_NAME?: string;
	NODE_ENV?: string;
}

function getProvider(env: StorageEnv = process.env): StorageProvider {
	const val = env.STORAGE_PROVIDER?.toLowerCase();
	if (val === "s3") return "s3";
	if (val === "azure") return "azure";
	return "local";
}

const storageCollections = { media: true } as const;

/** Identity documents live under their own prefix in their own private container. */
const PRIVATE_PREFIX = "verification";

/**
 * Checked at config build time, on the environment alone.
 *
 * Deliberately NOT conditioned on `AppSettings.verification.enabled`: the
 * config is built before the database is reachable, so a check that read the
 * flag would either block startup on a database round trip or silently pass.
 * The rule this enforces is the one that matters either way — if this
 * deployment stores files at all, identity documents are not in the bucket the
 * CDN serves.
 */
export function assertPrivateStorageConfig(env: StorageEnv = process.env): string | null {
	const provider = getProvider(env);

	if (provider === "local") {
		return env.NODE_ENV === "production"
			? "STORAGE_PROVIDER=local stores identity documents on the container filesystem; refused in production. Set STORAGE_PROVIDER to s3 or azure."
			: null;
	}

	if (provider === "s3") {
		const priv = env.S3_PRIVATE_BUCKET?.trim() ?? "";
		if (!priv) return "S3_PRIVATE_BUCKET is empty; identity documents have nowhere private to go.";
		if (priv === (env.S3_BUCKET?.trim() ?? "")) {
			return "S3_PRIVATE_BUCKET is the same bucket as S3_BUCKET; identity documents would be served publicly.";
		}
		return null;
	}

	const container = env.AZURE_STORAGE_PRIVATE_CONTAINER_NAME?.trim() ?? "";
	if (!container) return "AZURE_STORAGE_PRIVATE_CONTAINER_NAME is empty; identity documents have nowhere private to go.";
	if (container === (env.AZURE_STORAGE_CONTAINER_NAME?.trim() ?? "")) {
		return "AZURE_STORAGE_PRIVATE_CONTAINER_NAME is the same container as AZURE_STORAGE_CONTAINER_NAME.";
	}
	return null;
}

export async function buildStoragePlugins(): Promise<Plugin[]> {
	const provider = getProvider();
	const refusal = assertPrivateStorageConfig();
	if (refusal) throw new Error(`[storage] ${refusal}`);

	if (provider === "s3") {
		const { s3Storage } = await import("@payloadcms/storage-s3");
		const credentials = {
			accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
			secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
		};
		const config = {
			credentials,
			region: process.env.S3_REGION ?? "us-east-1",
			...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }),
		};
		return [
			s3Storage({ collections: storageCollections, bucket: process.env.S3_BUCKET ?? "", config }),
			s3Storage({
				collections: { "verification-documents": { prefix: PRIVATE_PREFIX } },
				bucket: process.env.S3_PRIVATE_BUCKET ?? "",
				acl: "private",
				// A distinct cache key so the two adapters never share a client and
				// a private object can never be fetched with the public client's
				// configuration.
				clientUploads: false,
				config: { ...config },
			}),
		];
	}

	if (provider === "azure") {
		const { azureStorage } = await import("@payloadcms/storage-azure");
		const base = {
			baseURL: process.env.AZURE_STORAGE_ACCOUNT_BASEURL ?? "",
			connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING ?? "",
			allowContainerCreate: process.env.AZURE_STORAGE_ALLOW_CONTAINER_CREATE === "true",
		};
		return [
			azureStorage({ ...base, collections: storageCollections, containerName: process.env.AZURE_STORAGE_CONTAINER_NAME ?? "" }),
			azureStorage({
				...base,
				collections: { "verification-documents": { prefix: PRIVATE_PREFIX } },
				containerName: process.env.AZURE_STORAGE_PRIVATE_CONTAINER_NAME ?? "",
			}),
		];
	}

	// local: Payload stores both collections natively, each in its own staticDir.
	return [];
}
```

In `packages/api/src/payload.config.ts`, replace the `buildStoragePlugin()` call: `...(await buildStoragePlugins())` inside the `plugins` array, and update the import.

- [ ] **Step 5: Write `lib/privateFiles.ts`**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export interface PrivateDoc {
	id: string;
	filename: string;
	mimeType?: string | null;
	/** Storage prefix, when the adapter was configured with one. */
	prefix?: string | null;
}

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 60;

/**
 * The plugin's own `signedDownloads` is not used: it has no hook to write the
 * view log, and an identity document that can be opened without leaving a
 * record is the one thing this design does not allow.
 */
export async function createSignedDocumentUrl(
	doc: PrivateDoc,
	ttlSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<{ url: string; expiresAt: Date }> {
	const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
	const provider = process.env.STORAGE_PROVIDER?.toLowerCase();
	const key = doc.prefix ? `${doc.prefix}/${doc.filename}` : doc.filename;

	if (provider === "s3") {
		const [{ GetObjectCommand, S3Client }, { getSignedUrl }] = await Promise.all([
			import("@aws-sdk/client-s3"),
			import("@aws-sdk/s3-request-presigner"),
		]);
		const client = new S3Client({
			region: process.env.S3_REGION ?? "us-east-1",
			credentials: {
				accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
				secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
			},
			...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }),
		});
		const url = await getSignedUrl(
			client,
			new GetObjectCommand({
				Bucket: process.env.S3_PRIVATE_BUCKET ?? "",
				Key: key,
				ResponseContentDisposition: "inline",
				ResponseCacheControl: "no-store",
			}),
			{ expiresIn: ttlSeconds },
		);
		return { url, expiresAt };
	}

	if (provider === "azure") {
		const { BlobServiceClient, BlobSASPermissions } = await import("@azure/storage-blob");
		const service = BlobServiceClient.fromConnectionString(
			process.env.AZURE_STORAGE_CONNECTION_STRING ?? "",
		);
		const blob = service
			.getContainerClient(process.env.AZURE_STORAGE_PRIVATE_CONTAINER_NAME ?? "")
			.getBlobClient(key);
		const url = await blob.generateSasUrl({
			permissions: BlobSASPermissions.parse("r"),
			expiresOn: expiresAt,
			cacheControl: "no-store",
			contentDisposition: "inline",
		});
		return { url, expiresAt };
	}

	const exp = expiresAt.getTime();
	const sig = signLocalFileToken(doc.id, exp);
	return {
		url: `/api/verification/files/${encodeURIComponent(doc.id)}?exp=${exp}&sig=${sig}`,
		expiresAt,
	};
}

function localKey(): Buffer {
	const secret = process.env.PAYLOAD_SECRET ?? "";
	if (!secret) throw new Error("PAYLOAD_SECRET is not set; cannot sign a local document URL");
	return createHmac("sha256", secret).update("verification-files").digest();
}

export function signLocalFileToken(docId: string, expiresAtMs: number): string {
	return createHmac("sha256", localKey()).update(`${docId}:${expiresAtMs}`).digest("hex");
}

/** Constant-time, and false for anything malformed rather than throwing. */
export function verifyLocalFileToken(docId: string, expiresAtMs: number, signature: string): boolean {
	if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return false;
	let expected: Buffer;
	let given: Buffer;
	try {
		expected = Buffer.from(signLocalFileToken(docId, expiresAtMs), "hex");
		given = Buffer.from(signature, "hex");
	} catch {
		return false;
	}
	return expected.length === given.length && timingSafeEqual(expected, given);
}
```

- [ ] **Step 6: Write the local file route**

Create `packages/api/src/app/(frontend)/api/verification/files/[docId]/route.ts`:

```ts
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import config from "@payload-config";
import { getPayload } from "payload";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { verifyLocalFileToken } from "@/lib/privateFiles";

/**
 * Only reachable with the local storage provider, which is refused in
 * production (plugins/storage.ts). The signature is the whole authorisation:
 * it is minted by the moderation view route, which has already written the
 * view log, so there is no second authorisation check here to drift from it.
 */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ docId: string }> },
) {
	const { docId } = await params;
	const url = new URL(request.url);
	const exp = Number(url.searchParams.get("exp"));
	const sig = url.searchParams.get("sig") ?? "";

	if (!verifyLocalFileToken(docId, exp, sig)) {
		return errorResponse(ERROR_CODES.forbidden, 403);
	}

	const payload = await getPayload({ config });
	const doc = await payload
		.findByID({ collection: "verification-documents", id: docId, depth: 0, overrideAccess: true })
		.catch(() => null);
	if (!doc?.filename || doc.purgedAt) return errorResponse(ERROR_CODES.notFound, 404);

	const dir = path.resolve(
		process.cwd(),
		process.env.PRIVATE_UPLOADS_DIR ?? "private-uploads/verification",
	);
	const file = path.join(dir, path.basename(String(doc.filename)));
	const info = await stat(file).catch(() => null);
	if (!info?.isFile()) return errorResponse(ERROR_CODES.notFound, 404);

	return new Response(createReadStream(file) as unknown as ReadableStream, {
		headers: {
			"Content-Type": String(doc.mimeType ?? "application/octet-stream"),
			"Content-Length": String(info.size),
			"Content-Disposition": "inline",
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
```

- [ ] **Step 7: Verify**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/private-storage.int.spec.ts && bun run check-types
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/plugins/storage.ts packages/api/src/lib/privateFiles.ts "packages/api/src/app/(frontend)/api/verification/files/[docId]/route.ts" packages/api/src/payload.config.ts packages/api/package.json bun.lock packages/api/tests/int/private-storage.int.spec.ts
git commit -m "feat(api): add a private storage adapter and 60-second signed document URLs"
```

---

### Task 5: Migration, and `users.verified` becomes virtual

**Files:**
- Create: `packages/api/src/migrations/20260930_000000_p2_verification_levels.ts`
- Modify: `packages/api/src/migrations/index.ts`, `packages/api/src/collections/Users.ts`
- Test: `packages/api/tests/int/verification-migration.int.spec.ts`, `packages/api/tests/int/users-verified-virtual.int.spec.ts`

**Interfaces:**
- Consumes: `MongooseAdapter` migration shape from `migrations/20260924_000000_p1_variant_sku.ts`.
- Produces: migration `20260930_000000_p2_verification_levels` (`up`/`down`); `users.verified` as a virtual checkbox derived in `beforeRead`; `deriveVerified(doc)` exported from `collections/Users.ts` for the test.

**What migrates, and what breaks if it does not.** `users.verified` is today a stored checkbox that P1 code reads: `Users.beforeChange` pins it on update for anyone but an admin and clears it on create; `Users.afterChange` fires the `user-verified` Novu workflow when it flips false→true; `moderation/users/[id]/route.ts` returns it; the admin `ModerationWidget` counts `verified=false` users; `UserManagementClient` and `UserActions` toggle it; web `profile/me` and `profile/[userId]` and mobile `account/index`, `profile/[userId]`, `account/edit-profile`, `listing/[id]` all render a badge from it. If the field is `$unset` without the virtual replacing it, every one of those surfaces reads `undefined`: the badge silently disappears from released mobile builds (acceptable) **and** `beforeChange`'s `data.verified = originalDoc.verified` writes `undefined` over a field Payload will then persist as absent (harmless), **but** `ModerationWidget`'s `where[verified][equals]=false` stops matching any document and the tile reads 0 forever (a moderator would read that as "no work"). If the virtual is added without the `$unset`, the stored value shadows the derived one and an admin's old tick keeps showing "Verified" for an account that verified nothing — the precise thing this phase exists to end. Both halves ship in this task; Task 18 fixes the admin surfaces.

- [ ] **Step 1: Write the failing virtual-field test**

Create `packages/api/tests/int/users-verified-virtual.int.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveVerified, Users } from "../../src/collections/Users";

type Hook = (args: { doc: Record<string, unknown> }) => Record<string, unknown>;

describe("users.verified virtual", () => {
	it("is true exactly when the account has a live identity verification", () => {
		expect(deriveVerified({ identityVerifiedAt: "2026-10-01T00:00:00.000Z" })).toBe(true);
		expect(deriveVerified({ identityVerifiedAt: null })).toBe(false);
		expect(deriveVerified({})).toBe(false);
	});

	it("ignores a stored legacy tick", () => {
		expect(deriveVerified({ verified: true, legacyVerifiedAt: "2026-01-01T00:00:00.000Z" })).toBe(false);
	});

	it("is computed on every read, beside phoneVerified", () => {
		const beforeRead = (Users.hooks?.beforeRead ?? []) as Hook[];
		const doc = { phoneVerifiedAt: "2026-01-01", identityVerifiedAt: "2026-10-01", verified: false };
		const result = beforeRead.reduce((d, hook) => hook({ doc: d }), doc as Record<string, unknown>);
		expect(result.verified).toBe(true);
		expect(result.phoneVerified).toBe(true);
	});

	it("declares verified as a virtual field, so nothing writes it", () => {
		const verified = (Users.fields as { name?: string; virtual?: boolean }[]).find((f) => f.name === "verified");
		expect(verified?.virtual).toBe(true);
	});

	it("no longer triggers the user-verified workflow", () => {
		const source = Users.hooks?.afterChange?.map(String).join("\n") ?? "";
		expect(source).not.toContain("user-verified");
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/users-verified-virtual.int.spec.ts`
Expected: FAIL — `deriveVerified` is not exported.

- [ ] **Step 3: Make `verified` virtual in `Users.ts`**

1. Export the derivation:

```ts
/**
 * The person-level "Verified" badge is retired: badges belong to shops now.
 * This survives only so released app versions, which read `user.verified`,
 * show "Verified" for real identity verification instead of an admin's old
 * tick — and nothing else.
 *
 * Derived from the stored `identityVerifiedAt` and nothing else, on purpose. A
 * derivation that also asked "and is the owned shop still active?" would need
 * one shop query per user document, on a collection whose `read` is `anyone`
 * and which every listing populates: an N+1 across the whole public surface.
 * The cost of not asking is narrow and known — an owner whose shop is
 * suspended keeps a "Verified" badge in a released build until they update.
 * Current clients read the badge from the shop's `capabilities`, where
 * suspension is handled correctly.
 */
export function deriveVerified(doc: Record<string, unknown>): boolean {
	return Boolean(doc.identityVerifiedAt);
}
```

2. In the existing `beforeRead` hook, add the line beside `phoneVerified`:

```ts
			({ doc }) => {
				doc.phoneVerified = Boolean(doc.phoneVerifiedAt);
				doc.verified = deriveVerified(doc);
				return doc;
			},
```

3. Replace the stored `verified` field with:

```ts
		{
			name: "verified",
			type: "checkbox",
			virtual: true,
			admin: { position: "sidebar", readOnly: true, description: "Derived from identityVerifiedAt. Not stored." },
		},
```

4. In `beforeChange`, delete `data.verified = undefined;` from the create branch and `data.verified = originalDoc.verified;` from the update branch. A virtual field is never persisted, so pinning it is a no-op that only reads as though something still writes it.

5. In `afterChange`, delete the whole `// Notify user when they become verified` block and the now-unused `operation` / `previousDoc` destructuring if nothing else uses them.

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/users-verified-virtual.int.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing migration test**

Create `packages/api/tests/int/verification-migration.int.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { up } from "../../src/migrations/20260930_000000_p2_verification_levels";

function fakeMongo() {
	const users = [
		{ _id: "u-1", verified: true, updatedAt: new Date("2026-05-01T00:00:00.000Z") },
		{ _id: "u-2", verified: false, updatedAt: new Date("2026-06-01T00:00:00.000Z") },
		{ _id: "u-3", updatedAt: new Date("2026-07-01T00:00:00.000Z") },
	];
	const createdIndexes: unknown[] = [];
	const collection = (docs: Record<string, unknown>[]) => ({
		find: (query: Record<string, unknown>) => ({
			toArray: async () =>
				"verified" in query ? docs.filter((d) => d.verified === true) : docs,
		}),
		updateOne: vi.fn(async (filter: { _id: string }, update: { $set?: Record<string, unknown> }) => {
			const doc = docs.find((d) => d._id === filter._id);
			if (doc && update.$set) Object.assign(doc, update.$set);
		}),
		updateMany: vi.fn(async (_f: unknown, update: { $unset?: Record<string, unknown> }) => {
			if (update.$unset) for (const doc of docs) for (const key of Object.keys(update.$unset)) delete doc[key];
		}),
		createIndex: vi.fn(async (keys: unknown, options: unknown) => {
			createdIndexes.push({ keys, options });
		}),
	});
	const usersCollection = collection(users);
	const requestsCollection = collection([]);
	return {
		users,
		createdIndexes,
		payload: {
			logger: { info: vi.fn(), error: vi.fn() },
			db: {
				collections: {
					users: { collection: usersCollection },
					"verification-requests": { collection: requestsCollection },
				},
			},
		},
	};
}

describe("p2 verification migration", () => {
	it("records the legacy tick as a date and removes the stored field", async () => {
		const { payload, users } = fakeMongo();
		await up({ payload } as never);
		expect(users[0]).toMatchObject({ legacyVerifiedAt: new Date("2026-05-01T00:00:00.000Z") });
		expect(users.every((u) => !("verified" in u))).toBe(true);
	});

	it("grants nobody a level", async () => {
		const { payload, users } = fakeMongo();
		await up({ payload } as never);
		expect(users.some((u) => "level" in u || "identityVerifiedAt" in u)).toBe(false);
	});

	it("creates the partial unique index that makes one open request per shop and level a database rule", async () => {
		const { payload, createdIndexes } = fakeMongo();
		await up({ payload } as never);
		expect(createdIndexes).toContainEqual({
			keys: { openKey: 1 },
			options: expect.objectContaining({
				unique: true,
				partialFilterExpression: { openKey: { $type: "string" } },
			}),
		});
	});

	it("changes nothing on a second run", async () => {
		const { payload, users } = fakeMongo();
		await up({ payload } as never);
		const after = JSON.parse(JSON.stringify(users));
		await up({ payload } as never);
		expect(JSON.parse(JSON.stringify(users))).toEqual(after);
	});
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-migration.int.spec.ts`
Expected: FAIL — the migration module does not exist.

- [ ] **Step 7: Write the migration**

Create `packages/api/src/migrations/20260930_000000_p2_verification_levels.ts`:

```ts
import type { MigrateDownArgs, MigrateUpArgs, MongooseAdapter } from "@payloadcms/db-mongodb";

const OPEN_KEY_INDEX = "verification_open_key_unique";

/** One open request per shop and level, enforced by the database rather than by a read-then-write. */
const OPEN_KEY_FILTER = { openKey: { $type: "string" } } as const;

const raw = (payload: MigrateUpArgs["payload"], slug: string) =>
	(payload.db as unknown as MongooseAdapter).collections[slug].collection;

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const users = raw(payload, "users");

	// Keep the fact that an admin had ticked the box; it grants nothing, because
	// the box checked nothing. Idempotent: after the $unset below, the query
	// matches nothing on a second run.
	const legacy = await users.find({ verified: true }).toArray();
	for (const user of legacy) {
		await users.updateOne(
			{ _id: user._id },
			{ $set: { legacyVerifiedAt: user.updatedAt ?? new Date() } },
		);
	}

	await users.updateMany({}, { $unset: { verified: "" } });

	await raw(payload, "verification-requests").createIndex(
		{ openKey: 1 },
		{ unique: true, name: OPEN_KEY_INDEX, partialFilterExpression: OPEN_KEY_FILTER },
	);

	payload.logger.info({
		msg: "[migration] users.verified retired; verification-requests.openKey is unique per open request",
		legacyVerifiedUsers: legacy.length,
		index: OPEN_KEY_INDEX,
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await raw(payload, "verification-requests").dropIndex(OPEN_KEY_INDEX).catch(() => undefined);
	// `verified` is not restored: `legacyVerifiedAt` is the record of who had
	// it, and re-deriving a boolean from it would re-create the exact
	// meaningless badge this migration removed.
}
```

Register it in `packages/api/src/migrations/index.ts`, following the existing shape.

- [ ] **Step 8: Verify**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-migration.int.spec.ts tests/int/users-verified-virtual.int.spec.ts && bun run generate:types && bun run check-types
```

Expected: PASS. `payload-types.ts` still declares `verified?: boolean | null` (virtual fields stay in the generated type).

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/migrations/20260930_000000_p2_verification_levels.ts packages/api/src/migrations/index.ts packages/api/src/collections/Users.ts packages/api/src/payload-types.ts packages/api/tests/int/verification-migration.int.spec.ts packages/api/tests/int/users-verified-virtual.int.spec.ts
git commit -m "feat(api): retire the stored users.verified checkbox behind a derived virtual field"
```

---

### Task 6: The transition machine

**Files:**
- Create: `packages/api/src/lib/verificationTransitions.ts`
- Test: `packages/api/tests/int/verification-transitions.int.spec.ts`

**Interfaces:**
- Consumes: `VERIFICATION_STATUSES`, `VerificationStatus` (Task 2).
- Produces:
  - `type TransitionSource = "seller" | "reviewer" | "vendor" | "system"`
  - `type TransitionName` — one of `open`, `submit`, `claim`, `release`, `request_info`, `approve`, `auto_approve`, `reject`, `revoke`, `expire`, `resubmit`
  - `TRANSITIONS: Record<TransitionName, { from: readonly VerificationStatus[]; to: VerificationStatus; by: TransitionSource; logAction: ModerationAction | null }>`
  - `canTransition(name, from): boolean`, `nextStatus(name): VerificationStatus`, `logActionFor(name): ModerationAction | null`
  - `TERMINAL_STATUSES = ["rejected", "revoked", "expired"] as const`, `isTerminal(status)`, `isOpen(status)`

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/int/verification-transitions.int.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { VERIFICATION_STATUSES } from "../../src/collections/VerificationRequests";
import {
	canTransition, isOpen, isTerminal, logActionFor, nextStatus, TRANSITIONS,
} from "../../src/lib/verificationTransitions";

/** The spec's transition table, as data, so the test says what the product does. */
const ALLOWED: [string, string, string, string | null][] = [
	["submit", "draft", "submitted", null],
	["claim", "submitted", "in_review", "verification.claim"],
	["release", "in_review", "submitted", "verification.release"],
	["request_info", "in_review", "needs_info", "verification.request_info"],
	["approve", "in_review", "approved", "verification.approve"],
	["auto_approve", "submitted", "approved", "verification.approve"],
	["reject", "in_review", "rejected", "verification.reject"],
	["resubmit", "needs_info", "submitted", null],
	["revoke", "approved", "revoked", "verification.revoke"],
	["expire", "draft", "expired", "verification.expire"],
	["expire", "needs_info", "expired", "verification.expire"],
	["expire", "approved", "expired", "verification.expire"],
];

describe("verification transition table", () => {
	it.each(ALLOWED)("allows %s from %s to %s", (name, from, to, action) => {
		expect(canTransition(name as never, from as never)).toBe(true);
		expect(nextStatus(name as never)).toBe(to);
		expect(logActionFor(name as never)).toBe(action);
	});

	it("forbids every from/name pair the table does not list", () => {
		const allowed = new Set(ALLOWED.map(([name, from]) => `${name}:${from}`));
		for (const name of Object.keys(TRANSITIONS)) {
			for (const from of VERIFICATION_STATUSES) {
				if (name === "open") continue;
				expect(
					canTransition(name as never, from),
					`${name} from ${from}`,
				).toBe(allowed.has(`${name}:${from}`));
			}
		}
	});

	it("lets nothing leave a terminal status", () => {
		for (const from of ["rejected", "revoked", "expired"] as const) {
			expect(isTerminal(from)).toBe(true);
			for (const name of Object.keys(TRANSITIONS)) {
				expect(canTransition(name as never, from), `${name} from ${from}`).toBe(false);
			}
		}
	});

	it("names the four statuses that hold a shop+level slot open", () => {
		expect(VERIFICATION_STATUSES.filter(isOpen)).toEqual([
			"draft", "submitted", "in_review", "needs_info",
		]);
	});

	it("attributes each transition to the right source", () => {
		expect(TRANSITIONS.submit.by).toBe("seller");
		expect(TRANSITIONS.approve.by).toBe("reviewer");
		expect(TRANSITIONS.auto_approve.by).toBe("system");
		expect(TRANSITIONS.expire.by).toBe("system");
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-transitions.int.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/verificationTransitions.ts`**

```ts
import type { ModerationAction } from "../collections/ModerationLog";
import type { VerificationStatus } from "../collections/VerificationRequests";

export type TransitionSource = "seller" | "reviewer" | "vendor" | "system";

export type TransitionName =
	| "open" | "submit" | "claim" | "release" | "request_info"
	| "approve" | "auto_approve" | "reject" | "revoke" | "expire" | "resubmit";

export interface Transition {
	from: readonly VerificationStatus[];
	to: VerificationStatus;
	by: TransitionSource;
	/** null where the change is the seller's own and leaves no moderation trace. */
	logAction: ModerationAction | null;
}

export const TERMINAL_STATUSES = ["rejected", "revoked", "expired"] as const;
export const OPEN_STATUSES = ["draft", "submitted", "in_review", "needs_info"] as const;

export function isTerminal(status: VerificationStatus): boolean {
	return (TERMINAL_STATUSES as readonly string[]).includes(status);
}
export function isOpen(status: VerificationStatus): boolean {
	return (OPEN_STATUSES as readonly string[]).includes(status);
}

/**
 * The whole state machine, as data. `services/verification.ts` consults it
 * before every write, so a refusal is one `409 verification.invalidTransition`
 * in one place rather than a guard per handler.
 *
 * `submit` covers both the seller submitting a level-3 request and the vendor
 * result moving a level-2 request out of `draft`; `resubmit` is the separate
 * `needs_info` → `submitted` path because it also stamps `respondedAt`.
 */
export const TRANSITIONS: Record<TransitionName, Transition> = {
	open: { from: [], to: "draft", by: "seller", logAction: null },
	submit: { from: ["draft"], to: "submitted", by: "seller", logAction: null },
	resubmit: { from: ["needs_info"], to: "submitted", by: "seller", logAction: null },
	claim: { from: ["submitted"], to: "in_review", by: "reviewer", logAction: "verification.claim" },
	release: { from: ["in_review"], to: "submitted", by: "reviewer", logAction: "verification.release" },
	request_info: { from: ["in_review"], to: "needs_info", by: "reviewer", logAction: "verification.request_info" },
	approve: { from: ["in_review"], to: "approved", by: "reviewer", logAction: "verification.approve" },
	auto_approve: { from: ["submitted"], to: "approved", by: "system", logAction: "verification.approve" },
	reject: { from: ["in_review"], to: "rejected", by: "reviewer", logAction: "verification.reject" },
	revoke: { from: ["approved"], to: "revoked", by: "reviewer", logAction: "verification.revoke" },
	expire: { from: ["draft", "needs_info", "approved"], to: "expired", by: "system", logAction: "verification.expire" },
};

export function canTransition(name: TransitionName, from: VerificationStatus): boolean {
	if (isTerminal(from)) return false;
	return TRANSITIONS[name].from.includes(from);
}

export function nextStatus(name: TransitionName): VerificationStatus {
	return TRANSITIONS[name].to;
}

export function logActionFor(name: TransitionName): ModerationAction | null {
	return TRANSITIONS[name].logAction;
}
```

- [ ] **Step 4: Verify and commit**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-transitions.int.spec.ts && bun run check-types
cd /home/yvan/Workspaces/Projects/bns/bns-repo && bunx biome check --write packages/api/src/lib/verificationTransitions.ts packages/api/tests/int/verification-transitions.int.spec.ts
git add packages/api/src/lib/verificationTransitions.ts packages/api/tests/int/verification-transitions.int.spec.ts
git commit -m "feat(api): add the verification status machine as a pure transition table"
```

---

### Task 7: `setShopLevel`, `onShopLevelChanged` and `recomputeShopLevel`

**Files:**
- Modify: `packages/api/src/services/shops.ts`
- Create: `packages/api/src/services/verificationLevel.ts`
- Test: `packages/api/tests/int/verification-level.int.spec.ts`

**Interfaces:**
- Consumes: `writeShop(req, shopId, data)` (`services/shops.ts`), `shopCapabilities` (Task 1), `relationId`, `onCommit` / `commitContextOf` (`lib/transactions.ts`).
- Produces:
  - In `services/shops.ts`: `setShopLevel(req, shopId, input: { level: 1 | 2 | 3; levelExpiresAt: string | null; verifiedAt?: string | null }): Promise<Shop>`; `onShopLevelChanged(listener: ShopLevelListener): () => void`; `type ShopLevelListener = (req: PayloadRequest, event: ShopLevelChange) => Promise<void> | void`; `interface ShopLevelChange { shopId: string; previousLevel: number; level: number; cause: LevelCause }`; `__resetShopLevelListeners()` for tests
  - In `services/verificationLevel.ts`: `recomputeShopLevel(req, shopId, cause: LevelCause): Promise<ShopLevelChange | null>`; `type LevelCause = "approved" | "rejected" | "revoked" | "expired" | "superseded" | "owner_changed" | "shop_closed" | "manual"`

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/int/verification-level.int.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetShopLevelListeners, onShopLevelChanged } from "../../src/services/shops";
import { recomputeShopLevel } from "../../src/services/verificationLevel";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-01T00:00:00.000Z");
const IN_A_YEAR = "2027-10-01T00:00:00.000Z";
const IN_TWO_YEARS = "2028-10-01T00:00:00.000Z";
const YESTERDAY = "2026-09-30T00:00:00.000Z";

function seed(requests: Record<string, unknown>[] = []) {
	return fakePayload({
		users: [{ id: "u-1", role: "user", name: "Aïcha" }, { id: "u-2", role: "user", name: "Autre" }],
		shops: [{ id: "s-1", handle: "akwa", name: "Akwa", owner: "u-1", status: "active", level: 1 }],
		"verification-requests": requests,
		"moderation-log": [],
	});
}

const req = (payload: ReturnType<typeof seed>) => ({ payload, context: {}, user: null }) as never;
const shop = (p: ReturnType<typeof seed>) => p.store.shops.find((s) => s.id === "s-1");

const approved = (over: Record<string, unknown>) => ({
	id: "vr-1", shop: "s-1", submittedBy: "u-1", requestedLevel: 2,
	status: "approved", expiresAt: IN_TWO_YEARS, ...over,
});

beforeEach(() => { __resetShopLevelListeners(); });

describe("recomputeShopLevel", () => {
	it("keeps an active shop at level 1 with no approved request", async () => {
		const payload = seed();
		expect(await recomputeShopLevel(req(payload), "s-1", "manual")).toBeNull();
		expect(shop(payload)).toMatchObject({ level: 1, levelExpiresAt: null });
	});

	it("raises to level 2 on an approved, unexpired level-2 request", async () => {
		const payload = seed([approved({})]);
		const change = await recomputeShopLevel(req(payload), "s-1", "approved");
		expect(change).toMatchObject({ shopId: "s-1", previousLevel: 1, level: 2, cause: "approved" });
		expect(shop(payload)).toMatchObject({ level: 2, levelExpiresAt: IN_TWO_YEARS });
		expect(shop(payload)?.verifiedAt).toBeTruthy();
	});

	it("stays at 1 when a level-3 request is approved without level 2", async () => {
		const payload = seed([approved({ id: "vr-3", requestedLevel: 3 })]);
		await recomputeShopLevel(req(payload), "s-1", "approved");
		expect(shop(payload)?.level).toBe(1);
	});

	it("reaches level 3 only with both, and takes the earlier expiry", async () => {
		const payload = seed([
			approved({ id: "vr-2", requestedLevel: 2, expiresAt: IN_A_YEAR }),
			approved({ id: "vr-3", requestedLevel: 3, expiresAt: IN_TWO_YEARS }),
		]);
		await recomputeShopLevel(req(payload), "s-1", "approved");
		expect(shop(payload)).toMatchObject({ level: 3, levelExpiresAt: IN_A_YEAR });
	});

	it("does not count a request submitted by someone who is no longer the owner", async () => {
		const payload = seed([approved({ submittedBy: "u-2" })]);
		await recomputeShopLevel(req(payload), "s-1", "owner_changed");
		expect(shop(payload)?.level).toBe(1);
	});

	it("does not count an expired approval, and drops the shop back", async () => {
		const payload = seed([approved({ expiresAt: YESTERDAY })]);
		payload.store.shops[0].level = 2;
		payload.store.shops[0].levelExpiresAt = YESTERDAY;
		const change = await recomputeShopLevel(req(payload), "s-1", "expired", NOW);
		expect(change).toMatchObject({ previousLevel: 2, level: 1 });
		expect(shop(payload)).toMatchObject({ level: 1, levelExpiresAt: null });
	});

	it("keeps verifiedAt once it is set, even when the level later drops", async () => {
		const payload = seed([approved({})]);
		await recomputeShopLevel(req(payload), "s-1", "approved");
		const first = shop(payload)?.verifiedAt;
		payload.store["verification-requests"][0].status = "revoked";
		await recomputeShopLevel(req(payload), "s-1", "revoked");
		expect(shop(payload)).toMatchObject({ level: 1, verifiedAt: first });
	});

	it("gives every capability nothing while the shop is suspended, without changing the stored level", async () => {
		const payload = seed([approved({})]);
		await recomputeShopLevel(req(payload), "s-1", "approved");
		payload.store.shops[0].status = "suspended";
		await recomputeShopLevel(req(payload), "s-1", "manual");
		expect(shop(payload)?.level).toBe(2);
	});
});

describe("onShopLevelChanged", () => {
	it("fires once per change, with the previous and the new level", async () => {
		const listener = vi.fn();
		onShopLevelChanged(listener);
		const payload = seed([approved({})]);
		await recomputeShopLevel(req(payload), "s-1", "approved");
		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener.mock.calls[0][1]).toMatchObject({ shopId: "s-1", previousLevel: 1, level: 2, cause: "approved" });
	});

	it("does not fire when the level is unchanged", async () => {
		const listener = vi.fn();
		onShopLevelChanged(listener);
		const payload = seed();
		await recomputeShopLevel(req(payload), "s-1", "manual");
		expect(listener).not.toHaveBeenCalled();
	});

	it("lets one listener's failure through without stopping the others or the transition", async () => {
		const bad = vi.fn(() => { throw new Error("P4 exploded"); });
		const good = vi.fn();
		onShopLevelChanged(bad);
		onShopLevelChanged(good);
		const payload = seed([approved({})]);
		await expect(recomputeShopLevel(req(payload), "s-1", "approved")).resolves.toMatchObject({ level: 2 });
		expect(good).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-level.int.spec.ts`
Expected: FAIL — `recomputeShopLevel` / `onShopLevelChanged` do not exist.

- [ ] **Step 3: Add the level writer and the listener registry to `services/shops.ts`**

Append, after `writeShop`:

```ts
export type LevelCause =
	| "approved" | "rejected" | "revoked" | "expired"
	| "superseded" | "owner_changed" | "shop_closed" | "manual";

export interface ShopLevelChange {
	shopId: string;
	previousLevel: number;
	level: number;
	cause: LevelCause;
}

export type ShopLevelListener = (
	req: PayloadRequest,
	event: ShopLevelChange,
) => Promise<void> | void;

const shopLevelListeners: ShopLevelListener[] = [];

/**
 * P3 registers the team pause here, P4 and P5 their own reactions. Listeners
 * run inside the transition's transaction, so a listener that writes is part
 * of the same atomic change.
 */
export function onShopLevelChanged(listener: ShopLevelListener): () => void {
	shopLevelListeners.push(listener);
	return () => {
		const index = shopLevelListeners.indexOf(listener);
		if (index >= 0) shopLevelListeners.splice(index, 1);
	};
}

/** Test-only: listeners are module state, and a suite that registers one must be able to undo it. */
export function __resetShopLevelListeners(): void {
	shopLevelListeners.length = 0;
}

export async function notifyShopLevelChanged(
	req: PayloadRequest,
	event: ShopLevelChange,
): Promise<void> {
	for (const listener of [...shopLevelListeners]) {
		try {
			await listener(req, event);
		} catch (error) {
			// A later phase's reaction must not roll back a verification decision
			// that is otherwise correct; the decision is the record, the reaction
			// is a consequence.
			req.payload.logger.error({ err: error, event }, "[shops] level listener failed");
		}
	}
}

/**
 * The only writer of `shops.level`, `levelExpiresAt` and `verifiedAt`. Goes
 * through `writeShop`, so the Shops `afterChange` hook still queues the search
 * event that re-indexes the shop's listings on a level change — a direct
 * `payload.update` here would silently stop that happening.
 */
export async function setShopLevel(
	req: PayloadRequest,
	shopId: string,
	input: { level: 1 | 2 | 3; levelExpiresAt: string | null; verifiedAt?: string | null },
): Promise<Shop> {
	const data: Record<string, unknown> = {
		level: input.level,
		levelExpiresAt: input.levelExpiresAt,
	};
	// Once set, it stays: it records when this shop first proved an identity,
	// not whether it currently has one.
	if (input.verifiedAt) data.verifiedAt = input.verifiedAt;
	return writeShop(req, shopId, data);
}
```

- [ ] **Step 4: Write `services/verificationLevel.ts`**

```ts
import type { PayloadRequest } from "payload";
import { relationId } from "../lib/relationId";
import type { VerificationRequest } from "../payload-types";
import {
	type LevelCause,
	notifyShopLevelChanged,
	setShopLevel,
	type ShopLevelChange,
} from "./shops";

function backing(
	requests: VerificationRequest[],
	level: 2 | 3,
	ownerId: string,
	now: Date,
): VerificationRequest | null {
	return (
		requests.find(
			(request) =>
				request.requestedLevel === level &&
				request.status === "approved" &&
				relationId(request.submittedBy) === ownerId &&
				Boolean(request.expiresAt) &&
				Date.parse(String(request.expiresAt)) > now.getTime(),
		) ?? null
	);
}

/**
 * Recomputes the shop's level from the requests that currently back it, and
 * writes it through `setShopLevel`. Runs inside every transition that can
 * change a level, so the stored level is never a guess about what some job
 * will do next.
 *
 * Suspension is deliberately not consulted: a suspended shop keeps its stored
 * level and `shopCapabilities` reports nothing for it, so lifting the
 * suspension restores exactly what was proved, with no re-verification.
 */
export async function recomputeShopLevel(
	req: PayloadRequest,
	shopId: string,
	cause: LevelCause,
	now = new Date(),
): Promise<ShopLevelChange | null> {
	const shop = await req.payload.findByID({
		collection: "shops",
		id: shopId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const ownerId = relationId(shop.owner) ?? "";
	const previousLevel = Number(shop.level ?? 1);

	const found = await req.payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		where: { and: [{ shop: { equals: shopId } }, { status: { equals: "approved" } }] },
	});
	const requests = found.docs as VerificationRequest[];

	const level2 = backing(requests, 2, ownerId, now);
	const level3 = level2 ? backing(requests, 3, ownerId, now) : null;
	const level: 1 | 2 | 3 = level3 ? 3 : level2 ? 2 : 1;

	const expiries = [level2, level3]
		.filter((request): request is VerificationRequest => request !== null)
		.map((request) => Date.parse(String(request.expiresAt)));
	const levelExpiresAt = expiries.length
		? new Date(Math.min(...expiries)).toISOString()
		: null;

	await setShopLevel(req, shopId, {
		level,
		levelExpiresAt,
		verifiedAt: level >= 2 && !shop.verifiedAt ? now.toISOString() : null,
	});

	if (level === previousLevel) return null;

	const change: ShopLevelChange = { shopId, previousLevel, level, cause };
	await notifyShopLevelChanged(req, change);
	return change;
}
```

- [ ] **Step 5: Verify and commit**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-level.int.spec.ts tests/int/shops.int.spec.ts && bun run check-types
cd /home/yvan/Workspaces/Projects/bns/bns-repo && bunx biome check --write packages/api/src/services/shops.ts packages/api/src/services/verificationLevel.ts packages/api/tests/int/verification-level.int.spec.ts
git add packages/api/src/services/shops.ts packages/api/src/services/verificationLevel.ts packages/api/tests/int/verification-level.int.spec.ts
git commit -m "feat(api): recompute a shop's level from its approved requests through one writer"
```

---

### Task 8: `services/verification.ts` — transitions, decisions and cascades

**Files:**
- Create: `packages/api/src/services/verification.ts`
- Test: `packages/api/tests/int/verification-service.int.spec.ts`

**Interfaces:**
- Consumes: `withTransaction`, `TRANSITIONS`/`canTransition`/`logActionFor` (Task 6), `recomputeShopLevel` (Task 7), `getVerificationSettings` (Task 1), `shopCapabilities`, `canActOn` (`access/roles.ts`), `ServiceError`, `ModerationError`, `relationId`.
- Produces (all `Promise`-returning, all taking `payload` first and running their own `withTransaction`):
  - `openRequest(payload, actor: ServiceUser, shopId, level: 2 | 3): Promise<VerificationRequest>`
  - `submitRequest(payload, actor, requestId): Promise<VerificationRequest>`
  - `claimRequest(payload, actor: Actor, requestId, options?: { force?: boolean }): Promise<VerificationRequest>`
  - `releaseRequest(payload, actor, requestId, options?: { system?: boolean })`
  - `requestInfo(payload, actor, requestId, input: { reasonCode: string; message: string })`
  - `approveRequest(payload, actor, requestId, input: { note?: string | null; checklist?: Record<string, boolean> })`
  - `rejectRequest(payload, actor, requestId, input: { reasonCode: string; sellerMessage: string; note?: string | null })`
  - `revokeRequest(payload, actor, requestId, input: { reasonCode: string; note?: string | null })`
  - `expireRequest(payload, requestId, cause: "idle" | "no_response" | "lapsed" | "superseded" | "shop_closed", options?: { supersededBy?: string })`
  - `deleteDraft(payload, actor, requestId)`
  - `expiryFor(level: 2 | 3, approvedAt: Date, documentExpiresAt?: Date | null): Date`
  - `cooldownUntil(lastRejection: { decidedAt: string; reasonCode: string | null } | null): Date | null`
  - `VERIFICATION_CONTEXT = { verificationService: true, shopService: true, moderationAction: true }`

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/int/verification-service.int.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { __resetShopLevelListeners } from "../../src/services/shops";
import {
	approveRequest, claimRequest, cooldownUntil, expireRequest, expiryFor,
	openRequest, rejectRequest, releaseRequest, requestInfo, revokeRequest, submitRequest,
} from "../../src/services/verification";
import { fakePayload } from "./helpers/fakePayload";

const OWNER = { id: "u-1", role: "user", name: "Aïcha Mbappe" };
const MOD = { id: "m-1", role: "moderator", name: "Grâce" };
const MOD2 = { id: "m-2", role: "moderator", name: "Colleague" };
const ADMIN = { id: "a-1", role: "admin", name: "Boss" };

const AUTHORISED = {
	enabled: true,
	kycProvider: "didit",
	autoApproveIdentity: false,
	authorisation: {
		reference: "ANTIC-2026-0042", grantedAt: "2026-09-01T00:00:00.000Z",
		transfersAuthorised: true, consentVersion: "kyc-2026-10-v1",
	},
};

function seed(over: { requests?: Record<string, unknown>[]; settings?: Record<string, unknown> } = {}) {
	return fakePayload(
		{
			users: [OWNER, MOD, MOD2, ADMIN].map((u) => ({ ...u })),
			shops: [
				{ id: "s-1", handle: "akwa", name: "Akwa", owner: "u-1", status: "active", level: 1 },
				{ id: "s-m", handle: "modshop", name: "Mod", owner: "m-1", status: "active", level: 1 },
			],
			"shop-members": [{ id: "sm-1", shop: "s-1", user: "u-1", role: "owner" }],
			"verification-requests": over.requests ?? [],
			"verification-documents": [],
			"moderation-log": [],
		},
		{ globals: { "app-settings": { verification: over.settings ?? AUTHORISED } } },
	);
}

const requests = (p: ReturnType<typeof seed>) => p.store["verification-requests"];
const log = (p: ReturnType<typeof seed>) => p.store["moderation-log"];
const shop = (p: ReturnType<typeof seed>) => p.store.shops.find((s) => s.id === "s-1");

const approvedL2 = (over: Record<string, unknown> = {}) => ({
	id: "vr-2", shop: "s-1", submittedBy: "u-1", requestedLevel: 2, status: "approved",
	openKey: null, approvedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2028-09-01T00:00:00.000Z",
	...over,
});

beforeEach(() => { __resetShopLevelListeners(); });

describe("expiryFor", () => {
	const approvedAt = new Date("2026-10-01T00:00:00.000Z");

	it("gives level 2 two years, or the document's own expiry when that is sooner", () => {
		expect(expiryFor(2, approvedAt).toISOString()).toBe("2028-10-01T00:00:00.000Z");
		expect(expiryFor(2, approvedAt, new Date("2027-01-01T00:00:00.000Z")).toISOString())
			.toBe("2027-01-01T00:00:00.000Z");
	});

	it("keeps an already-expired document from granting anything", () => {
		const past = new Date("2026-01-01T00:00:00.000Z");
		expect(expiryFor(2, approvedAt, past).getTime()).toBeLessThan(approvedAt.getTime());
	});

	it("gives level 3 two years and ignores any document expiry", () => {
		expect(expiryFor(3, approvedAt, new Date("2027-01-01T00:00:00.000Z")).toISOString())
			.toBe("2028-10-01T00:00:00.000Z");
	});
});

describe("cooldownUntil", () => {
	it("is 24 hours after an ordinary rejection and 7 days after a fraud one", () => {
		const decidedAt = "2026-10-01T00:00:00.000Z";
		expect(cooldownUntil({ decidedAt, reasonCode: "document_invalid" })?.toISOString())
			.toBe("2026-10-02T00:00:00.000Z");
		expect(cooldownUntil({ decidedAt, reasonCode: "fraud_suspected" })?.toISOString())
			.toBe("2026-10-08T00:00:00.000Z");
		expect(cooldownUntil(null)).toBeNull();
	});
});

describe("openRequest", () => {
	it("creates a draft with an openKey and no log entry", async () => {
		const payload = seed();
		const request = await openRequest(payload, OWNER, "s-1", 2);
		expect(request).toMatchObject({ status: "draft", requestedLevel: 2, openKey: "s-1:2", submittedBy: "u-1" });
		expect(log(payload)).toHaveLength(0);
	});

	it("returns the existing open request instead of a second one", async () => {
		const payload = seed();
		const first = await openRequest(payload, OWNER, "s-1", 2);
		expect(await openRequest(payload, OWNER, "s-1", 2)).toMatchObject({ id: first.id });
		expect(requests(payload)).toHaveLength(1);
	});

	it("refuses anyone but the owner", async () => {
		await expect(openRequest(seed(), { id: "m-1", role: "moderator" }, "s-1", 2))
			.rejects.toMatchObject({ code: "verification.notOwner", status: 403 });
	});

	it("refuses level 3 before level 2 is effective", async () => {
		await expect(openRequest(seed(), OWNER, "s-1", 3))
			.rejects.toMatchObject({ code: "verification.levelNotEligible", status: 409 });
	});

	it("allows level 3 once level 2 is effective", async () => {
		const payload = seed({ requests: [approvedL2()] });
		shop(payload)!.level = 2;
		shop(payload)!.levelExpiresAt = "2028-09-01T00:00:00.000Z";
		await expect(openRequest(payload, OWNER, "s-1", 3)).resolves.toMatchObject({ requestedLevel: 3 });
	});

	it("refuses during the cooldown after a rejection", async () => {
		const payload = seed({
			requests: [{
				id: "vr-old", shop: "s-1", submittedBy: "u-1", requestedLevel: 2, status: "rejected", openKey: null,
				decision: { decidedAt: new Date().toISOString(), reasonCode: "document_invalid" },
			}],
		});
		await expect(openRequest(payload, OWNER, "s-1", 2))
			.rejects.toMatchObject({ code: "verification.cooldown", status: 429 });
	});

	it("refuses when the feature is off", async () => {
		const payload = seed({ settings: { ...AUTHORISED, enabled: false } });
		await expect(openRequest(payload, OWNER, "s-1", 2))
			.rejects.toMatchObject({ code: "verification.disabled", status: 403 });
	});

	it("refuses when the shop is not active", async () => {
		const payload = seed();
		shop(payload)!.status = "suspended";
		await expect(openRequest(payload, OWNER, "s-1", 2))
			.rejects.toMatchObject({ code: "shop.inactive" });
	});
});

describe("claim", () => {
	const submitted = () => [{
		id: "vr-1", shop: "s-1", submittedBy: "u-1", requestedLevel: 3, status: "submitted",
		openKey: "s-1:3", submittedAt: "2026-10-01T00:00:00.000Z",
	}];

	it("assigns the reviewer, stamps claimedAt and logs it", async () => {
		const payload = seed({ requests: submitted() });
		await claimRequest(payload, MOD, "vr-1");
		expect(requests(payload)[0]).toMatchObject({ status: "in_review", assignee: "m-1" });
		expect(requests(payload)[0].claimedAt).toBeTruthy();
		expect(log(payload).at(-1)).toMatchObject({
			action: "verification.claim", targetType: "verification-request", targetId: "vr-1", actor: "m-1",
		});
	});

	it("lets exactly one of two racing claims win", async () => {
		const payload = seed({ requests: submitted() });
		const results = await Promise.allSettled([
			claimRequest(payload, MOD, "vr-1"),
			claimRequest(payload, MOD2, "vr-1"),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
		expect(rejected.reason).toMatchObject({ code: "verification.invalidTransition", status: 409 });
		expect(log(payload).filter((e) => e.action === "verification.claim")).toHaveLength(1);
	});

	it("refuses a reviewer who owns the shop", async () => {
		const payload = seed({
			requests: [{ ...submitted()[0], shop: "s-m", submittedBy: "m-1", openKey: "s-m:3" }],
		});
		await expect(claimRequest(payload, MOD, "vr-1"))
			.rejects.toMatchObject({ code: "verification.conflictOfInterest", status: 403 });
	});

	it("refuses a reviewer who is a member of the shop", async () => {
		const payload = seed({ requests: submitted() });
		payload.store["shop-members"].push({ id: "sm-2", shop: "s-1", user: "m-1", role: "staff" });
		await expect(claimRequest(payload, MOD, "vr-1"))
			.rejects.toMatchObject({ code: "verification.conflictOfInterest" });
	});

	it("refuses a reviewer who cannot act on the owner, and lets an admin force a takeover", async () => {
		const payload = seed({ requests: submitted() });
		payload.store.users.find((u) => u.id === "u-1")!.role = "admin";
		await expect(claimRequest(payload, MOD, "vr-1"))
			.rejects.toMatchObject({ code: "moderation.rankTooLow", status: 403 });

		const payload2 = seed({ requests: submitted() });
		await claimRequest(payload2, MOD, "vr-1");
		await expect(claimRequest(payload2, MOD2, "vr-1")).rejects.toMatchObject({ code: "verification.invalidTransition" });
		await expect(claimRequest(payload2, ADMIN, "vr-1", { force: true })).resolves.toMatchObject({ assignee: "a-1" });
	});
});

describe("decisions", () => {
	const claimed = (over: Record<string, unknown> = {}) => [{
		id: "vr-1", shop: "s-1", submittedBy: "u-1", requestedLevel: 3, status: "in_review",
		openKey: "s-1:3", assignee: "m-1", claimedAt: "2026-10-01T00:00:00.000Z",
		business: {
			businessType: "company", legalName: "AKWA SARL", rccmNumber: "RC/DLA/2020/B/1234",
			niu: "M012345678901X", registeredAddress: "Akwa", city: "Douala",
			legalRepresentativeName: "Aïcha Mbappe", legalRepresentativeIsOwner: true,
		},
		...over,
	}];
	const FULL_CHECKLIST = {
		name_matches_registry: true, registration_number_matches_document: true,
		niu_matches_certificate: true, representative_matches_identity_or_mandate: true,
		documents_legible_and_current: true,
	};

	it("lets only the assignee decide", async () => {
		const payload = seed({ requests: claimed() });
		await expect(approveRequest(payload, MOD2, "vr-1", { checklist: FULL_CHECKLIST }))
			.rejects.toMatchObject({ code: "verification.notAssignee", status: 403 });
	});

	it("refuses a level-3 approval with an incomplete checklist", async () => {
		const payload = seed({ requests: claimed() });
		await expect(approveRequest(payload, MOD, "vr-1", {
			checklist: { ...FULL_CHECKLIST, niu_matches_certificate: false },
		})).rejects.toMatchObject({ code: "verification.checklistIncomplete", status: 400 });
	});

	it("approves level 3, copies the reviewed legal block onto the shop and raises the level", async () => {
		const payload = seed({ requests: [...claimed(), approvedL2()] });
		shop(payload)!.level = 2;
		shop(payload)!.levelExpiresAt = "2028-09-01T00:00:00.000Z";

		await approveRequest(payload, MOD, "vr-1", { checklist: FULL_CHECKLIST });

		expect(requests(payload)[0]).toMatchObject({ status: "approved", openKey: null });
		expect(requests(payload)[0].expiresAt).toBeTruthy();
		expect(shop(payload)).toMatchObject({
			level: 3,
			legal: expect.objectContaining({ legalName: "AKWA SARL", niu: "M012345678901X" }),
		});
		expect(shop(payload)!.legal.verifiedAt).toBeTruthy();
		expect(log(payload).at(-1)).toMatchObject({ action: "verification.approve", targetId: "vr-1" });
	});

	it("requires a reason and a seller message to reject or ask for more", async () => {
		const payload = seed({ requests: claimed() });
		await expect(rejectRequest(payload, MOD, "vr-1", { reasonCode: "", sellerMessage: "" }))
			.rejects.toMatchObject({ code: "moderation.reasonRequired", status: 400 });
		await expect(requestInfo(payload, MOD, "vr-1", { reasonCode: "document_missing", message: "" }))
			.rejects.toMatchObject({ code: "moderation.reasonRequired" });
	});

	it("moves to needs_info, then back to submitted on resubmission, stamping respondedAt", async () => {
		const payload = seed({ requests: claimed() });
		await requestInfo(payload, MOD, "vr-1", { reasonCode: "document_missing", message: "Send the NIU certificate." });
		expect(requests(payload)[0]).toMatchObject({ status: "needs_info", assignee: null });
		expect(requests(payload)[0].infoRequests).toHaveLength(1);

		await submitRequest(payload, OWNER, "vr-1");
		expect(requests(payload)[0].status).toBe("submitted");
		expect(requests(payload)[0].infoRequests[0].respondedAt).toBeTruthy();
	});

	it("releases a claim back to the queue", async () => {
		const payload = seed({ requests: claimed() });
		await releaseRequest(payload, MOD, "vr-1");
		expect(requests(payload)[0]).toMatchObject({ status: "submitted", assignee: null, claimedAt: null });
		expect(log(payload).at(-1)).toMatchObject({ action: "verification.release" });
	});

	it("rolls the status and the level back when the log write fails", async () => {
		const payload = seed({ requests: [...claimed(), approvedL2()] });
		shop(payload)!.level = 2;
		const create = payload.create;
		payload.create = async (args: { collection: string }) => {
			if (args.collection === "moderation-log") throw new Error("log unavailable");
			return create(args as never);
		};
		await expect(approveRequest(payload, MOD, "vr-1", { checklist: FULL_CHECKLIST })).rejects.toThrow();
		expect(requests(payload)[0].status).toBe("in_review");
		expect(shop(payload)!.level).toBe(2);
	});
});

describe("revoke and expiry cascades", () => {
	it("revoking level 2 revokes an approved level 3 and drops the shop to 1", async () => {
		const payload = seed({
			requests: [approvedL2(), approvedL2({ id: "vr-3", requestedLevel: 3 })],
		});
		shop(payload)!.level = 3;
		await revokeRequest(payload, MOD, "vr-2", { reasonCode: "fraud" });

		expect(requests(payload).map((r) => r.status)).toEqual(["revoked", "revoked"]);
		expect(shop(payload)!.level).toBe(1);
		expect(log(payload).at(-1)).toMatchObject({
			action: "verification.revoke", metadata: expect.objectContaining({ cascadedRequestIds: ["vr-3"] }),
		});
	});

	it("expiring level 2 leaves an approved level 3 alone but still drops the shop to 1", async () => {
		const payload = seed({
			requests: [approvedL2(), approvedL2({ id: "vr-3", requestedLevel: 3 })],
		});
		shop(payload)!.level = 3;
		await expireRequest(payload, "vr-2", "lapsed");
		expect(requests(payload).map((r) => r.status)).toEqual(["expired", "approved"]);
		expect(shop(payload)!.level).toBe(1);
	});

	it("records a system expiry with no actor", async () => {
		const payload = seed({
			requests: [{ id: "vr-1", shop: "s-1", submittedBy: "u-1", requestedLevel: 3, status: "draft", openKey: "s-1:3" }],
		});
		await expireRequest(payload, "vr-1", "idle");
		expect(log(payload).at(-1)).toMatchObject({
			action: "verification.expire", actorRole: "system", actor: null, metadata: { cause: "idle" },
		});
	});

	it("marks the old approval superseded when a renewal is approved", async () => {
		const payload = seed({ requests: [approvedL2()] });
		await expireRequest(payload, "vr-2", "superseded", { supersededBy: "vr-9" });
		expect(requests(payload)[0].status).toBe("expired");
		expect(log(payload).at(-1)).toMatchObject({ metadata: expect.objectContaining({ supersededBy: "vr-9" }) });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-service.int.spec.ts`
Expected: FAIL — `services/verification.ts` does not exist.

- [ ] **Step 3: Write `services/verification.ts`**

Implement against the test above. The load-bearing pieces, in full:

```ts
import type { Payload, PayloadRequest } from "payload";
import { canActOn, isModerator } from "../access/roles";
import {
	LEVEL3_CHECKLIST_ITEMS,
	type VerificationStatus,
} from "../collections/VerificationRequests";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { shopCapabilities } from "../lib/shopCapabilities";
import { withTransaction } from "../lib/transactions";
import {
	canTransition, logActionFor, nextStatus, type TransitionName,
} from "../lib/verificationTransitions";
import { getVerificationSettings } from "../lib/verificationSettings";
import type { Shop, VerificationRequest } from "../payload-types";
import { recomputeShopLevel } from "./verificationLevel";
import type { ServiceUser } from "./shops";

/**
 * Three flags, because one transition touches three guarded surfaces:
 * `verificationService` for the request rows and the user's identity fields,
 * `shopService` for `shops.level` and friends, `moderationAction` for the log.
 */
export const VERIFICATION_CONTEXT = {
	verificationService: true,
	shopService: true,
	moderationAction: true,
} as const;

const COOLDOWN_HOURS = 24;
const FRAUD_COOLDOWN_DAYS = 7;
const LEVEL_VALIDITY_MONTHS = 24;
export const RENEWABLE_DAYS_BEFORE = 60;

function addMonths(date: Date, months: number): Date {
	const out = new Date(date.getTime());
	out.setUTCMonth(out.getUTCMonth() + months);
	return out;
}

/**
 * Level 2 is worth nothing past the identity document's own expiry, so the
 * earlier of the two wins — including when the document has already expired,
 * which yields a date in the past and therefore an effective level of 1 the
 * moment `shopCapabilities` looks. That is the correct answer: a reviewer who
 * approves an expired document grants nothing rather than granting 24 months.
 */
export function expiryFor(level: 2 | 3, approvedAt: Date, documentExpiresAt?: Date | null): Date {
	const standard = addMonths(approvedAt, LEVEL_VALIDITY_MONTHS);
	if (level === 3 || !documentExpiresAt) return standard;
	return documentExpiresAt.getTime() < standard.getTime() ? documentExpiresAt : standard;
}

export function cooldownUntil(
	lastRejection: { decidedAt: string; reasonCode: string | null } | null,
): Date | null {
	if (!lastRejection?.decidedAt) return null;
	const at = new Date(lastRejection.decidedAt);
	return lastRejection.reasonCode === "fraud_suspected"
		? new Date(at.getTime() + FRAUD_COOLDOWN_DAYS * 86_400_000)
		: new Date(at.getTime() + COOLDOWN_HOURS * 3_600_000);
}

const error = (code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES], status: number) =>
	new ServiceError(code, status);

/** The one place a status changes. Refuses anything the table does not list. */
async function transition(
	req: PayloadRequest,
	request: VerificationRequest,
	name: TransitionName,
	patch: Record<string, unknown>,
	source: "seller" | "reviewer" | "vendor" | "system",
	actorId: string | null,
): Promise<VerificationRequest> {
	const from = request.status as VerificationStatus;
	if (!canTransition(name, from)) {
		throw error(ERROR_CODES.verificationInvalidTransition, 409);
	}
	const to = nextStatus(name);
	const at = new Date().toISOString();

	return req.payload.update({
		collection: "verification-requests",
		id: request.id,
		req,
		overrideAccess: true,
		context: VERIFICATION_CONTEXT,
		data: {
			...patch,
			status: to,
			// Cleared the moment the request stops holding its slot, so the
			// partial unique index frees the shop+level pair for the next one.
			openKey: (["draft", "submitted", "in_review", "needs_info"] as string[]).includes(to)
				? `${relationId(request.shop)}:${request.requestedLevel}`
				: null,
			statusHistory: [
				...(request.statusHistory ?? []),
				{ status: to, at, actor: actorId, source },
			],
		} as Partial<VerificationRequest>,
	});
}

async function writeLog(
	req: PayloadRequest,
	input: {
		action: string; targetId: string; actor: { id: string; role?: string | null } | null;
		reason?: string | null; note?: string | null; metadata?: Record<string, unknown>;
	},
): Promise<void> {
	await req.payload.create({
		collection: "moderation-log",
		req,
		overrideAccess: true,
		context: VERIFICATION_CONTEXT,
		data: {
			actor: input.actor?.id ?? null,
			actorRole: input.actor?.role ?? "system",
			action: input.action,
			targetType: "verification-request",
			targetId: input.targetId,
			reason: input.reason ?? undefined,
			note: input.note ?? undefined,
			metadata: input.metadata ?? undefined,
		} as never,
	});
}

/**
 * A reviewer who owns the shop, or holds any `shop-members` row in it, cannot
 * review it. Checked on claim, and again on every decision: a membership can
 * be created after the claim.
 */
async function assertNoConflict(
	req: PayloadRequest,
	actorId: string,
	shop: Shop,
): Promise<void> {
	if (relationId(shop.owner) === actorId) {
		throw error(ERROR_CODES.verificationConflictOfInterest, 403);
	}
	const membership = await req.payload.find({
		collection: "shop-members",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		req,
		where: { and: [{ shop: { equals: shop.id } }, { user: { equals: actorId } }] },
	});
	if (membership.docs.length > 0) {
		throw error(ERROR_CODES.verificationConflictOfInterest, 403);
	}
}
```

The remaining exported functions follow one shape — load, guard, transition, side effects, log, recompute — all inside a single `withTransaction`. `approveRequest` is the fullest case:

```ts
export async function approveRequest(
	payload: Payload,
	actor: { id: string; role?: string | null },
	requestId: string,
	input: { note?: string | null; checklist?: Record<string, boolean> } = {},
): Promise<VerificationRequest> {
	return withTransaction(payload, async (req) => {
		const request = await loadRequest(req, requestId);
		const shop = await loadShop(req, relationId(request.shop) ?? "");
		await assertReviewer(req, actor, request, shop);

		if (request.requestedLevel === 3) {
			const checklist = input.checklist ?? {};
			if (!LEVEL3_CHECKLIST_ITEMS.every((item) => checklist[item] === true)) {
				throw error(ERROR_CODES.verificationChecklistIncomplete, 400);
			}
		}

		const approvedAt = new Date();
		const documentExpiresAt = request.kyc?.documentExpiresAt
			? new Date(String(request.kyc.documentExpiresAt))
			: null;
		const expiresAt = expiryFor(request.requestedLevel as 2 | 3, approvedAt, documentExpiresAt);

		// A renewal supersedes the approval it replaces, in the same transaction:
		// two live approvals for one shop and level would both feed the level
		// recomputation and the earlier expiry would win by accident.
		const superseded = await findApproved(req, relationId(request.shop) ?? "", request.requestedLevel as 2 | 3);
		if (superseded && superseded.id !== request.id) {
			await transition(req, superseded, "expire", { revokedAt: null }, "system", null);
			await writeLog(req, {
				action: "verification.expire", targetId: String(superseded.id), actor: null,
				metadata: { cause: "superseded", supersededBy: String(request.id) },
			});
		}

		const updated = await transition(req, request, "approve", {
			approvedAt: approvedAt.toISOString(),
			expiresAt: expiresAt.toISOString(),
			assignee: null,
			supersedes: superseded && superseded.id !== request.id ? superseded.id : null,
			decision: {
				decidedBy: actor.id,
				decidedAt: approvedAt.toISOString(),
				reasonCode: null,
				sellerMessage: null,
				internalNote: input.note ?? null,
				checklist: input.checklist ?? null,
			},
		}, "reviewer", actor.id);

		if (request.requestedLevel === 2) {
			await req.payload.update({
				collection: "users", id: relationId(request.submittedBy) ?? "",
				req, overrideAccess: true, context: VERIFICATION_CONTEXT,
				data: { identityVerifiedAt: approvedAt.toISOString(), identityVerification: request.id },
			});
		} else {
			await writeShopLegal(req, shop.id, request, approvedAt);
		}

		await writeLog(req, {
			action: "verification.approve", targetId: String(request.id),
			actor: { id: actor.id, role: actor.role ?? "moderator" },
			metadata: {
				level: request.requestedLevel,
				expiresAt: expiresAt.toISOString(),
				supersededRequestId: superseded && superseded.id !== request.id ? String(superseded.id) : null,
			},
		});

		await recomputeShopLevel(req, shop.id, "approved");
		return updated;
	}, { user: actor, context: VERIFICATION_CONTEXT });
}
```

Write the remaining functions to the same shape. The rules each must obey, all pinned by the test:

- `openRequest`: read the settings (`enabled` false → `verification.disabled` 403); caller must be `shop.owner` (`verification.notOwner` 403); shop status `active` (`shop.inactive` 409); level 3 requires `shopCapabilities(shop).effectiveLevel >= 2` (`verification.levelNotEligible` 409); an existing open request for the pair is returned as-is; the last rejected request's `cooldownUntil` in the future → `verification.cooldown` 429; a `payload.create` rejected by the `openKey` unique index is a lost race — re-read and return the winner rather than surfacing a driver error (use `isUniqueViolation` from `services/shops.ts`). No log entry.
- `submitRequest`: `draft` → `submit`, `needs_info` → `resubmit`; the level-3 branch validates the business group and the required documents per business type, and stamps `respondedAt` on every unanswered `infoRequests` row; refuses with `verification.fieldsInvalid` / `verification.documentsMissing`.
- `claimRequest`: `assertNoConflict`, then `canActOn(actor, owner)` (`moderation.rankTooLow` 403), then `transition(…, "claim")`. `force: true` is admin-only and first runs `release` on the current assignee, logging `verification.release` with `metadata.forcedBy`.
- `releaseRequest`: assignee or admin; `options.system` writes the entry with `actorRole: "system"` and `actor: null`.
- `requestInfo`: assignee only; `reasonCode` and `message` both required; appends to `infoRequests`, clears `assignee` and `claimedAt`.
- `rejectRequest`: assignee only; `reasonCode` and `sellerMessage` required; writes `decision`; no level change (recompute anyway — it is cheap and makes the post-condition unconditional).
- `revokeRequest`: any moderator who passes `assertNoConflict` and `canActOn`; `reasonCode` required; a level-2 revocation cascades every `approved` level-3 request of the same shop to `revoked` (ids in `metadata.cascadedRequestIds`), and clears `users.identityVerifiedAt` / `identityVerification`.
- `expireRequest`: system only, no actor; `metadata.cause`, plus `metadata.supersededBy` when given; a level-2 expiry does **not** cascade to level 3.
- `deleteDraft`: owner, `draft` only; deletes the request's documents through `services/verificationDocuments.ts` (Task 12) and then the row.

Every one of them ends with `await recomputeShopLevel(req, shopId, cause)` inside the same transaction.

- [ ] **Step 4: Verify**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-service.int.spec.ts && bun run check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/verification.ts packages/api/tests/int/verification-service.int.spec.ts
git commit -m "feat(api): add the verification service with transactional transitions and audit entries"
```

---

### Task 9: Review signals

**Files:**
- Create: `packages/api/src/lib/verificationSignals.ts`
- Modify: `packages/api/src/services/verification.ts` (compute on vendor result and on level-3 submit)
- Test: `packages/api/tests/int/verification-signals.int.spec.ts`

**Interfaces:**
- Consumes: `REVIEW_SIGNAL_CODES` (Task 2), `peppered` (Task 3), `relationId`.
- Produces:
  - `normalizeName(value: string): string[]` — lowercased, accents stripped, tokens under 2 characters dropped
  - `namesOverlap(a: string, b: string): boolean`
  - `normalizeRegistrationNumber(value: string): string`, `normalizeNiu(value: string): string`
  - `NIU_PATTERN = /^[A-Z]\d{12}[A-Z]$/`, `isWellFormedNiu(value: string): boolean`
  - `computeSignals(input: SignalInput): ReviewSignal[]` where `ReviewSignal = { code: ReviewSignalCode; detail: string | null; relatedRequest: string | null }`

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/int/verification-signals.int.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	computeSignals, isWellFormedNiu, namesOverlap, normalizeName,
	normalizeNiu, normalizeRegistrationNumber,
} from "../../src/lib/verificationSignals";

describe("name normalisation", () => {
	it("lowercases, strips accents and drops one-letter tokens", () => {
		expect(normalizeName("Aïcha M. MBAPPÉ")).toEqual(["aicha", "mbappe"]);
	});

	it("matches across word order and accents", () => {
		expect(namesOverlap("Aïcha Mbappé", "MBAPPE AICHA")).toBe(true);
		expect(namesOverlap("Aïcha Mbappé", "Jean Nkodo")).toBe(false);
	});

	it("does not match on an accidental short token", () => {
		expect(namesOverlap("Le Grand Marché", "De La Croix")).toBe(false);
	});
});

describe("registration numbers", () => {
	it("uppercases and collapses spaces", () => {
		expect(normalizeRegistrationNumber("  rc/dla/2020/b/ 1234 ")).toBe("RC/DLA/2020/B/ 1234");
		expect(normalizeNiu(" m0123 45678901x ")).toBe("M012345678901X");
	});

	it("knows a well-formed NIU from a merely plausible one", () => {
		expect(isWellFormedNiu("M012345678901X")).toBe(true);
		expect(isWellFormedNiu("MO12345678901X")).toBe(false);
		expect(isWellFormedNiu("M01234567890")).toBe(false);
	});
});

describe("computeSignals", () => {
	const base = {
		ownerName: "Aïcha Mbappé",
		shopId: "s-1",
		kyc: { status: "approved" as const, givenNames: "Aicha", familyName: "Mbappe", adult: true, documentNumberHash: "hash-a" },
		business: null,
		documentDuplicates: [],
		otherRequests: [],
	};

	it("is empty for a clean approved result", () => {
		expect(computeSignals(base)).toEqual([]);
	});

	it("flags an identity document already used by another person", () => {
		const signals = computeSignals({
			...base,
			otherRequests: [
				{ id: "vr-9", shopId: "s-2", submittedById: "u-9", status: "approved", documentNumberHash: "hash-a", rccmNumber: null, niu: null },
			],
		});
		expect(signals).toContainEqual({ code: "identity_reused", detail: "u-9", relatedRequest: "vr-9" });
	});

	it("does not flag the same person re-verifying", () => {
		expect(computeSignals({
			...base,
			ownerId: "u-1",
			otherRequests: [
				{ id: "vr-9", shopId: "s-2", submittedById: "u-1", status: "approved", documentNumberHash: "hash-a", rccmNumber: null, niu: null },
			],
		}).map((s) => s.code)).not.toContain("identity_reused");
	});

	it("flags a name that shares no token with the account name", () => {
		expect(computeSignals({ ...base, kyc: { ...base.kyc, givenNames: "Jean", familyName: "Nkodo" } })
			.map((s) => s.code)).toContain("name_mismatch");
	});

	it("flags an underage holder", () => {
		expect(computeSignals({ ...base, kyc: { ...base.kyc, adult: false } }).map((s) => s.code)).toContain("underage");
	});

	it("flags the vendor's own declined and review outcomes", () => {
		expect(computeSignals({ ...base, kyc: { ...base.kyc, status: "declined" } }).map((s) => s.code)).toContain("kyc_declined");
		expect(computeSignals({ ...base, kyc: { ...base.kyc, status: "review" } }).map((s) => s.code)).toContain("kyc_review");
	});

	it("flags a document file already uploaded on another shop", () => {
		expect(computeSignals({ ...base, documentDuplicates: [{ documentId: "vd-9", shopId: "s-2" }] })
			.map((s) => s.code)).toContain("document_reused");
	});

	it("does not flag a duplicate file on the same shop", () => {
		expect(computeSignals({ ...base, documentDuplicates: [{ documentId: "vd-9", shopId: "s-1" }] })
			.map((s) => s.code)).not.toContain("document_reused");
	});

	it("flags an RCCM or NIU already declared by another shop", () => {
		const signals = computeSignals({
			...base,
			kyc: null,
			business: { rccmNumber: "RC/DLA/2020/B/1234", niu: "M012345678901X" },
			otherRequests: [
				{ id: "vr-8", shopId: "s-2", submittedById: "u-8", status: "approved", documentNumberHash: null, rccmNumber: "RC/DLA/2020/B/1234", niu: null },
				{ id: "vr-7", shopId: "s-3", submittedById: "u-7", status: "submitted", documentNumberHash: null, rccmNumber: null, niu: "M012345678901X" },
			],
		});
		expect(signals.map((s) => s.code)).toEqual(expect.arrayContaining(["rccm_reused", "niu_reused"]));
	});

	it("warns about a NIU shape without refusing it", () => {
		const signals = computeSignals({ ...base, kyc: null, business: { rccmNumber: null, niu: "BADNIU1234567" } });
		expect(signals.map((s) => s.code)).toContain("niu_format");
	});
});
```

- [ ] **Step 2: Run to verify it fails, then write `lib/verificationSignals.ts`**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-signals.int.spec.ts` → FAIL.

```ts
import type { ReviewSignalCode } from "../collections/VerificationRequests";

export interface ReviewSignal {
	code: ReviewSignalCode;
	detail: string | null;
	relatedRequest: string | null;
}

export const NIU_PATTERN = /^[A-Z]\d{12}[A-Z]$/;

/** Lowercase, accents stripped, tokens under 2 characters dropped. */
export function normalizeName(value: string): string[] {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length >= 2);
}

/**
 * Any shared token counts. Cameroonian names are routinely recorded in a
 * different order on a document than in an account, with or without a middle
 * name, so requiring a full match would flag almost everyone — and a signal
 * everyone trips is a signal reviewers stop reading.
 */
export function namesOverlap(a: string, b: string): boolean {
	const left = new Set(normalizeName(a));
	return normalizeName(b).some((token) => left.has(token));
}

export function normalizeRegistrationNumber(value: string): string {
	return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function normalizeNiu(value: string): string {
	return value.replace(/\s+/g, "").toUpperCase();
}

export function isWellFormedNiu(value: string): boolean {
	return NIU_PATTERN.test(normalizeNiu(value));
}

export interface SignalInput {
	ownerId?: string;
	ownerName: string;
	shopId: string;
	kyc: {
		status: "pending" | "approved" | "declined" | "review" | "abandoned" | "error" | "not_started";
		givenNames: string | null;
		familyName: string | null;
		adult: boolean;
		documentNumberHash: string | null;
	} | null;
	business: { rccmNumber: string | null; niu: string | null } | null;
	documentDuplicates: { documentId: string; shopId: string }[];
	otherRequests: {
		id: string; shopId: string; submittedById: string; status: string;
		documentNumberHash: string | null; rccmNumber: string | null; niu: string | null;
	}[];
}

/**
 * Signals never block on their own: they keep a request out of automatic
 * approval and put a chip in front of a reviewer. A rejection is always a
 * person's decision.
 */
export function computeSignals(input: SignalInput): ReviewSignal[] {
	const signals: ReviewSignal[] = [];
	const live = (status: string) =>
		["draft", "submitted", "in_review", "needs_info", "approved"].includes(status);

	if (input.kyc) {
		if (input.kyc.status === "declined") signals.push({ code: "kyc_declined", detail: null, relatedRequest: null });
		if (input.kyc.status === "review") signals.push({ code: "kyc_review", detail: null, relatedRequest: null });
		if (!input.kyc.adult) signals.push({ code: "underage", detail: null, relatedRequest: null });

		const documentName = [input.kyc.givenNames, input.kyc.familyName].filter(Boolean).join(" ");
		if (documentName && !namesOverlap(input.ownerName, documentName)) {
			signals.push({ code: "name_mismatch", detail: documentName, relatedRequest: null });
		}

		if (input.kyc.documentNumberHash) {
			const reuse = input.otherRequests.find(
				(other) =>
					other.documentNumberHash === input.kyc?.documentNumberHash &&
					other.submittedById !== input.ownerId &&
					live(other.status),
			);
			if (reuse) signals.push({ code: "identity_reused", detail: reuse.submittedById, relatedRequest: reuse.id });
		}
	}

	const foreignDuplicate = input.documentDuplicates.find((d) => d.shopId !== input.shopId);
	if (foreignDuplicate) {
		signals.push({ code: "document_reused", detail: foreignDuplicate.documentId, relatedRequest: null });
	}

	if (input.business) {
		const rccm = input.business.rccmNumber ? normalizeRegistrationNumber(input.business.rccmNumber) : null;
		if (rccm) {
			const reuse = input.otherRequests.find(
				(other) =>
					other.shopId !== input.shopId &&
					live(other.status) &&
					other.rccmNumber &&
					normalizeRegistrationNumber(other.rccmNumber) === rccm,
			);
			if (reuse) signals.push({ code: "rccm_reused", detail: rccm, relatedRequest: reuse.id });
		}

		const niu = input.business.niu ? normalizeNiu(input.business.niu) : null;
		if (niu) {
			const reuse = input.otherRequests.find(
				(other) =>
					other.shopId !== input.shopId &&
					live(other.status) &&
					other.niu &&
					normalizeNiu(other.niu) === niu,
			);
			if (reuse) signals.push({ code: "niu_reused", detail: niu, relatedRequest: reuse.id });
			if (!isWellFormedNiu(niu)) {
				signals.push({ code: "niu_format", detail: niu, relatedRequest: null });
			}
		}
	}

	return signals;
}
```

- [ ] **Step 3: Wire it into `services/verification.ts`**

Add an internal `refreshSignals(req, request)` that loads the other requests (one query, `where: { id: { not_equals: request.id } }` narrowed by the hashes and numbers at hand), calls `computeSignals`, and writes `reviewSignals` in the same transaction. Call it at the end of `submitRequest` for level 3 and from `processKycEvent` (Task 11) for level 2.

- [ ] **Step 4: Verify and commit**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-signals.int.spec.ts tests/int/verification-service.int.spec.ts && bun run check-types
git add packages/api/src/lib/verificationSignals.ts packages/api/src/services/verification.ts packages/api/tests/int/verification-signals.int.spec.ts
git commit -m "feat(api): compute review signals for identity and business verification"
```

---

### Task 10: The `KycProvider` interface and the Didit adapter

**Files:**
- Create: `packages/api/src/lib/kyc/types.ts`, `didit.ts`, `index.ts`
- Create: `packages/api/tests/int/fixtures/didit-approved.json`, `didit-declined.json`
- Test: `packages/api/tests/int/kyc-didit.int.spec.ts`

**Interfaces:**
- Consumes: `getVerificationSettings` (Task 1), `redact` helpers (`lib/redact.ts`) as the pattern for never logging a secret.
- Produces:
  - `KycProvider`, `KycResult`, `KycSession` in `lib/kyc/types.ts` exactly as the spec declares them
  - `diditProvider: KycProvider` in `lib/kyc/didit.ts`
  - `getKycProvider(name: "didit" | "smileid"): KycProvider` in `lib/kyc/index.ts`, throwing `ServiceError(verification.kycUnavailable, 503)` for an unimplemented adapter

- [ ] **Step 1: Write the fixtures**

Create `packages/api/tests/int/fixtures/didit-approved.json` with a realistic hosted-session result body: a `session_id`, a `status` of `"Approved"`, an `id_verification` object carrying `document_type: "Identity Card"`, `issuing_state: "CMR"`, `document_number`, `date_of_birth`, `expiration_date`, `first_name`, `last_name`, a `liveness` object with `status: "Approved"`, a `face_match` object with `score`, and a `warnings` array. Create `didit-declined.json` as the same shape with `status: "Declined"`, a non-empty `warnings` array and no `document_number`.

- [ ] **Step 2: Write the failing test**

Create `packages/api/tests/int/kyc-didit.int.spec.ts`:

```ts
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import approved from "./fixtures/didit-approved.json";
import declined from "./fixtures/didit-declined.json";
import { diditProvider } from "../../src/lib/kyc/didit";

process.env.DIDIT_WEBHOOK_SECRET = "whsec-test";
process.env.DIDIT_API_KEY = "key-test";
process.env.DIDIT_WORKFLOW_ID = "wf-1";

function signed(body: string, secret = "whsec-test", timestamp = String(Math.floor(Date.now() / 1000))) {
	return new Headers({
		"x-signature": createHmac("sha256", secret).update(body).digest("hex"),
		"x-timestamp": timestamp,
	});
}

describe("didit webhook verification", () => {
	it("accepts a body signed with the configured secret", async () => {
		const body = JSON.stringify({ session_id: "sess-1", status: "Approved", webhook_id: "evt-1" });
		await expect(diditProvider.verifyWebhook(body, signed(body))).resolves.toEqual({
			providerEventId: "evt-1", type: "Approved", sessionRef: "sess-1",
		});
	});

	it("refuses a body signed with another secret", async () => {
		const body = JSON.stringify({ session_id: "sess-1", status: "Approved", webhook_id: "evt-1" });
		await expect(diditProvider.verifyWebhook(body, signed(body, "wrong"))).rejects.toThrow();
	});

	it("refuses an unsigned body and a body with a stale timestamp", async () => {
		const body = JSON.stringify({ session_id: "sess-1" });
		await expect(diditProvider.verifyWebhook(body, new Headers())).rejects.toThrow();
		const stale = String(Math.floor(Date.now() / 1000) - 3600);
		await expect(diditProvider.verifyWebhook(body, signed(body, "whsec-test", stale))).rejects.toThrow();
	});

	it("never puts the secret in the thrown message", async () => {
		const body = JSON.stringify({ session_id: "sess-1" });
		await diditProvider.verifyWebhook(body, signed(body, "wrong")).catch((error: Error) => {
			expect(error.message).not.toContain("whsec-test");
		});
	});
});

describe("didit result normalisation", () => {
	const fetchReturning = (payload: unknown) =>
		vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));

	it("maps an approved result onto our own shape", async () => {
		vi.stubGlobal("fetch", fetchReturning(approved));
		const result = await diditProvider.fetchResult("sess-1");
		expect(result).toMatchObject({
			status: "approved", documentType: "national_id", documentCountry: "CM",
			livenessPassed: true,
		});
		expect(result.documentNumber).toBeTypeOf("string");
		expect(result.dateOfBirth).toBeInstanceOf(Date);
		expect(result.faceMatchScore).toBeGreaterThan(0);
		vi.unstubAllGlobals();
	});

	it("maps a declined result and carries its warnings", async () => {
		vi.stubGlobal("fetch", fetchReturning(declined));
		const result = await diditProvider.fetchResult("sess-1");
		expect(result.status).toBe("declined");
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.documentNumber).toBeNull();
		vi.unstubAllGlobals();
	});

	it("reports an unusable body as an error rather than an approval", async () => {
		vi.stubGlobal("fetch", fetchReturning({ session_id: "sess-1" }));
		await expect(diditProvider.fetchResult("sess-1")).resolves.toMatchObject({ status: "pending" });
		vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
		await expect(diditProvider.fetchResult("sess-1")).rejects.toThrow();
		vi.unstubAllGlobals();
	});
});

describe("didit session creation", () => {
	it("sends the workflow id and the reference, and returns the hosted URL", async () => {
		const fetchMock = vi.fn(async () =>
			new Response(JSON.stringify({ session_id: "sess-9", url: "https://verify.didit.me/s/sess-9" }), { status: 201 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		const session = await diditProvider.createSession({
			reference: "VR-vr-1-1", locale: "fr", returnUrl: "https://buynsellem.com/seller/verification/identity/return?request=vr-1",
		});
		expect(session).toMatchObject({ sessionRef: "sess-9", url: "https://verify.didit.me/s/sess-9" });
		const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
		expect(body).toMatchObject({ workflow_id: "wf-1", vendor_data: "VR-vr-1-1" });
		expect(String(fetchMock.mock.calls[0][1]?.headers?.["x-api-key"])).toBe("key-test");
		vi.unstubAllGlobals();
	});
});
```

- [ ] **Step 3: Run to verify it fails, then write the three modules**

`lib/kyc/types.ts` — copy the spec's declarations verbatim:

```ts
export interface KycSession {
	sessionRef: string;
	url: string;
	expiresAt: Date;
}

export interface KycResult {
	status: "pending" | "approved" | "declined" | "review" | "abandoned";
	documentType: "national_id" | "passport" | "residence_permit" | null;
	documentCountry: string | null;
	/** Transient: hashed by the job, then discarded. Never stored. */
	documentNumber: string | null;
	documentExpiresAt: Date | null;
	givenNames: string | null;
	familyName: string | null;
	/** Transient: reduced to `adult`, then discarded. Never stored. */
	dateOfBirth: Date | null;
	livenessPassed: boolean;
	faceMatchScore: number | null;
	warnings: string[];
	reviewUrl: string | null;
}

export interface KycProvider {
	id: "didit" | "smileid";
	createSession(input: { reference: string; locale: "fr" | "en"; returnUrl: string }): Promise<KycSession>;
	verifyWebhook(rawBody: string, headers: Headers): Promise<{
		providerEventId: string; type: string; sessionRef: string;
	}>;
	fetchResult(sessionRef: string): Promise<KycResult>;
	deleteSessionData(sessionRef: string): Promise<void>;
}
```

`lib/kyc/didit.ts` implements it against Didit's hosted verification session. Key points the test pins:

- `verifyWebhook` compares with `timingSafeEqual` over the raw body, refuses a timestamp more than five minutes old, and throws a message that never interpolates the secret.
- `fetchResult` maps `Approved|Declined|In Review|Abandoned|Not Started|In Progress` onto our five statuses, `Identity Card|Passport|Residence Permit` onto ours, the ISO-3 issuing state onto alpha-2, and returns `documentNumber` and `dateOfBirth` as transient fields. A non-2xx response throws; a 2xx body missing the verification block is `pending`, never `approved`.
- `createSession` POSTs `{ workflow_id, vendor_data: reference, callback: returnUrl, language: locale }` with the `x-api-key` header.
- `deleteSessionData` DELETEs the session and resolves for a 404 (already gone is success).

`lib/kyc/index.ts`:

```ts
import { ERROR_CODES } from "../errors";
import { ServiceError } from "../serviceError";
import { diditProvider } from "./didit";
import type { KycProvider } from "./types";

/**
 * Smile ID is the fallback if Didit fails the vendor checklist. Adding it is a
 * new file behind this interface and a switch of
 * `AppSettings.verification.kycProvider` — nothing else changes.
 */
export function getKycProvider(name: "didit" | "smileid"): KycProvider {
	if (name === "didit") return diditProvider;
	throw new ServiceError(ERROR_CODES.verificationKycUnavailable, 503);
}
```

- [ ] **Step 4: Verify and commit**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/kyc-didit.int.spec.ts && bun run check-types
git add packages/api/src/lib/kyc packages/api/tests/int/kyc-didit.int.spec.ts packages/api/tests/int/fixtures/didit-approved.json packages/api/tests/int/fixtures/didit-declined.json
git commit -m "feat(api): add the KycProvider interface and the Didit adapter"
```

---

### Task 11: The vendor webhook route and `processKycEvent`

**Files:**
- Create: `packages/api/src/app/(frontend)/api/public/verification/webhook/[provider]/route.ts`
- Create: `packages/api/src/jobs/processKycEvent.ts`
- Modify: `packages/api/src/jobs/index.ts`, `packages/api/src/payload.config.ts`, `packages/api/src/services/verification.ts`
- Test: `packages/api/tests/int/kyc-event.int.spec.ts`

**Interfaces:**
- Consumes: `recordWebhookEvent` (`services/webhookEvents.ts`), `getKycProvider` (Task 10), `computeSignals` (Task 9), `transition`/`approveRequest` internals (Task 8), `peppered` (Task 3), `getVerificationSettings`.
- Produces:
  - `processKycEvent(payload, input: { webhookEventId: string; provider: "didit" | "smileid"; sessionRef: string }): Promise<{ handled: boolean; requestId: string | null; status: VerificationStatus | null }>`
  - `startKycSession(payload, actor, requestId, input: { consentVersion: string; locale: "fr" | "en" }): Promise<{ url: string; expiresAt: string }>` in `services/verification.ts`
  - `processKycEventTask` registered on the default queue, `retries: 5`
  - `POST /api/public/verification/webhook/{provider}`

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/int/kyc-event.int.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { processKycEvent } from "../../src/jobs/processKycEvent";
import { startKycSession } from "../../src/services/verification";
import { fakePayload } from "./helpers/fakePayload";

process.env.VERIFICATION_HASH_PEPPER = "pepper-test";

const OWNER = { id: "u-1", role: "user", name: "Aïcha Mbappé" };

const AUTHORISED = {
	enabled: true, kycProvider: "didit", autoApproveIdentity: false,
	authorisation: {
		reference: "ANTIC-2026-0042", grantedAt: "2026-09-01T00:00:00.000Z",
		transfersAuthorised: true, consentVersion: "kyc-2026-10-v1",
	},
};

const RESULT = {
	status: "approved" as const,
	documentType: "national_id" as const,
	documentCountry: "CM",
	documentNumber: "123456789",
	documentExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
	givenNames: "Aicha",
	familyName: "Mbappe",
	dateOfBirth: new Date("1995-03-04T00:00:00.000Z"),
	livenessPassed: true,
	faceMatchScore: 93,
	warnings: [],
	reviewUrl: "https://console.didit.me/s/sess-1",
};

function seed(over: { requests?: Record<string, unknown>[]; settings?: Record<string, unknown> } = {}) {
	return fakePayload(
		{
			users: [{ ...OWNER }],
			shops: [{ id: "s-1", handle: "akwa", name: "Akwa", owner: "u-1", status: "active", level: 1 }],
			"shop-members": [],
			"verification-requests": over.requests ?? [{
				id: "vr-1", shop: "s-1", submittedBy: "u-1", requestedLevel: 2, status: "draft",
				openKey: "s-1:2", kyc: { sessionRef: "sess-1", status: "pending", attempts: 1, provider: "didit" },
			}],
			"webhook-events": [{ id: "we-1", provider: "didit", providerEventId: "evt-1", processedAt: null }],
			"moderation-log": [],
		},
		{ globals: { "app-settings": { verification: over.settings ?? AUTHORISED } } },
	);
}

const request = (p: ReturnType<typeof seed>) => p.store["verification-requests"][0];
const shop = (p: ReturnType<typeof seed>) => p.store.shops[0];

const withProvider = (result: Partial<typeof RESULT> = {}) =>
	vi.doMock("../../src/lib/kyc", () => ({
		getKycProvider: () => ({
			id: "didit",
			fetchResult: async () => ({ ...RESULT, ...result }),
			createSession: async () => ({ sessionRef: "sess-9", url: "https://verify.didit.me/s/sess-9", expiresAt: new Date(Date.now() + 3_600_000) }),
			verifyWebhook: async () => ({ providerEventId: "evt-1", type: "Approved", sessionRef: "sess-1" }),
			deleteSessionData: async () => undefined,
		}),
	}));

describe("processKycEvent", () => {
	it("stores the outcome without the document number or the date of birth", async () => {
		withProvider();
		const payload = seed();
		await processKycEvent(payload, { webhookEventId: "we-1", provider: "didit", sessionRef: "sess-1" });

		const kyc = request(payload).kyc;
		expect(kyc).toMatchObject({
			status: "approved", documentType: "national_id", documentCountry: "CM",
			documentNumberLast4: "6789", adult: true, livenessPassed: true, faceMatchScore: 93,
		});
		expect(kyc.documentNumberHash).toMatch(/^[0-9a-f]{64}$/);
		expect(JSON.stringify(request(payload))).not.toContain("123456789");
		expect(JSON.stringify(request(payload))).not.toContain("1995-03-04");
	});

	it("moves an approved result to submitted and leaves the decision to a person", async () => {
		withProvider();
		const payload = seed();
		await processKycEvent(payload, { webhookEventId: "we-1", provider: "didit", sessionRef: "sess-1" });
		expect(request(payload).status).toBe("submitted");
		expect(shop(payload).level).toBe(1);
	});

	it("approves automatically when the setting is on and there is no signal", async () => {
		withProvider();
		const payload = seed({ settings: { ...AUTHORISED, autoApproveIdentity: true } });
		await processKycEvent(payload, { webhookEventId: "we-1", provider: "didit", sessionRef: "sess-1" });
		expect(request(payload).status).toBe("approved");
		expect(shop(payload).level).toBe(2);
		expect(payload.store["moderation-log"].at(-1)).toMatchObject({
			action: "verification.approve", actorRole: "system", metadata: expect.objectContaining({ automatic: true }),
		});
	});

	it("never approves automatically when a signal is present", async () => {
		withProvider({ givenNames: "Jean", familyName: "Nkodo" });
		const payload = seed({ settings: { ...AUTHORISED, autoApproveIdentity: true } });
		await processKycEvent(payload, { webhookEventId: "we-1", provider: "didit", sessionRef: "sess-1" });
		expect(request(payload).status).toBe("submitted");
		expect(request(payload).reviewSignals.map((s: { code: string }) => s.code)).toContain("name_mismatch");
	});

	it("moves a review result to submitted with the kyc_review signal", async () => {
		withProvider({ status: "review" });
		const payload = seed();
		await processKycEvent(payload, { webhookEventId: "we-1", provider: "didit", sessionRef: "sess-1" });
		expect(request(payload).status).toBe("submitted");
		expect(request(payload).reviewSignals.map((s: { code: string }) => s.code)).toContain("kyc_review");
	});

	it("leaves a declined result in draft so the owner can retry, until the third one", async () => {
		withProvider({ status: "declined" });
		const payload = seed();
		await processKycEvent(payload, { webhookEventId: "we-1", provider: "didit", sessionRef: "sess-1" });
		expect(request(payload).status).toBe("draft");

		request(payload).kyc.attempts = 3;
		await processKycEvent(payload, { webhookEventId: "we-1", provider: "didit", sessionRef: "sess-1" });
		expect(request(payload).status).toBe("submitted");
		expect(request(payload).reviewSignals.map((s: { code: string }) => s.code)).toContain("kyc_declined");
	});

	it("makes no transition for an abandoned or still-pending result", async () => {
		for (const status of ["abandoned", "pending"] as const) {
			withProvider({ status });
			const payload = seed();
			await processKycEvent(payload, { webhookEventId: "we-1", provider: "didit", sessionRef: "sess-1" });
			expect(request(payload).status).toBe("draft");
		}
	});

	it("is a no-op for a request that is already decided", async () => {
		withProvider();
		const payload = seed({
			requests: [{
				id: "vr-1", shop: "s-1", submittedBy: "u-1", requestedLevel: 2, status: "rejected", openKey: null,
				kyc: { sessionRef: "sess-1", status: "approved", attempts: 1 },
			}],
		});
		await expect(processKycEvent(payload, { webhookEventId: "we-1", provider: "didit", sessionRef: "sess-1" }))
			.resolves.toMatchObject({ handled: false });
		expect(request(payload).status).toBe("rejected");
	});

	it("is a no-op for an unknown session rather than a retry loop", async () => {
		withProvider();
		const payload = seed();
		await expect(processKycEvent(payload, { webhookEventId: "we-1", provider: "didit", sessionRef: "sess-unknown" }))
			.resolves.toMatchObject({ handled: false, requestId: null });
	});

	it("is idempotent: running the same event twice changes nothing the second time", async () => {
		withProvider();
		const payload = seed();
		await processKycEvent(payload, { webhookEventId: "we-1", provider: "didit", sessionRef: "sess-1" });
		const after = JSON.stringify(request(payload));
		await processKycEvent(payload, { webhookEventId: "we-1", provider: "didit", sessionRef: "sess-1" });
		expect(JSON.stringify(request(payload))).toBe(after);
	});
});

describe("startKycSession", () => {
	it("records the consent and returns a URL it does not store", async () => {
		withProvider();
		const payload = seed();
		const session = await startKycSession(payload, OWNER, "vr-1", {
			consentVersion: "kyc-2026-10-v1", locale: "fr",
		});
		expect(session.url).toContain("https://");
		expect(request(payload).consent).toMatchObject({ version: "kyc-2026-10-v1", locale: "fr" });
		expect(request(payload).kyc.sessionRef).toBe("sess-9");
		expect(JSON.stringify(request(payload))).not.toContain(session.url);
	});

	it("refuses a consent version that is not the current one", async () => {
		withProvider();
		await expect(startKycSession(seed(), OWNER, "vr-1", { consentVersion: "kyc-2025-01-v1", locale: "fr" }))
			.rejects.toMatchObject({ code: "verification.consentRequired", status: 409 });
	});

	it("refuses a fourth attempt on the same request", async () => {
		withProvider();
		const payload = seed();
		request(payload).kyc.attempts = 3;
		await expect(startKycSession(payload, OWNER, "vr-1", { consentVersion: "kyc-2026-10-v1", locale: "fr" }))
			.rejects.toMatchObject({ code: "verification.tooManyAttempts", status: 429 });
	});

	it("refuses a sixth session by the same owner in 30 days", async () => {
		withProvider();
		const payload = seed();
		for (let i = 0; i < 5; i++) {
			payload.store["verification-requests"].push({
				id: `vr-old-${i}`, shop: "s-1", submittedBy: "u-1", requestedLevel: 2, status: "expired",
				kyc: { attempts: 1, decidedAt: new Date().toISOString() },
				createdAt: new Date().toISOString(),
			});
		}
		await expect(startKycSession(payload, OWNER, "vr-1", { consentVersion: "kyc-2026-10-v1", locale: "fr" }))
			.rejects.toMatchObject({ code: "verification.tooManyAttempts" });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/kyc-event.int.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Write `jobs/processKycEvent.ts`**

The whole job body runs in one `withTransaction`. The data-minimisation part, in full — this is the code the spec's guarantee rests on:

```ts
	const result = await getKycProvider(provider).fetchResult(sessionRef);

	// `documentNumber` and `dateOfBirth` exist only in this scope. What is
	// written is a peppered hash, the last four digits, and a boolean — the
	// number itself and the date of birth never reach the database, and never
	// reach a log line either.
	const documentNumberHash = result.documentNumber ? peppered(result.documentNumber.replace(/\s+/g, "").toUpperCase()) : null;
	const documentNumberLast4 = result.documentNumber ? result.documentNumber.slice(-4) : null;
	const adult = result.dateOfBirth
		? Date.now() - result.dateOfBirth.getTime() >= 18 * 365.25 * 86_400_000
		: false;

	const kyc = {
		provider,
		sessionRef,
		status: result.status,
		attempts: request.kyc?.attempts ?? 1,
		decidedAt: new Date().toISOString(),
		documentType: result.documentType,
		documentCountry: result.documentCountry,
		documentNumberHash,
		documentNumberLast4,
		documentExpiresAt: result.documentExpiresAt?.toISOString() ?? null,
		givenNames: result.givenNames,
		familyName: result.familyName,
		adult,
		livenessPassed: result.livenessPassed,
		faceMatchScore: result.faceMatchScore,
		vendorWarnings: result.warnings,
		vendorReviewUrl: result.reviewUrl,
		vendorDataDeletedAt: null,
	};
```

Outcome handling, in the spec's order:

```ts
	switch (result.status) {
		case "approved": {
			const updated = await writeKyc(req, request, kyc, signals);
			const moved = await submitFromVendor(req, updated);
			if (settings.autoApproveIdentity && signals.length === 0) {
				return autoApprove(req, moved);
			}
			return { handled: true, requestId, status: moved.status };
		}
		case "review":
			return { handled: true, requestId, status: (await submitFromVendor(req, await writeKyc(req, request, kyc, signals))).status };
		case "declined": {
			const updated = await writeKyc(req, request, kyc, signals);
			// Below three attempts the request stays in `draft`, so the owner can
			// simply start another session. At the third decline a person looks:
			// a rejection is never taken by the machine.
			if ((updated.kyc?.attempts ?? 0) < 3) return { handled: true, requestId, status: "draft" };
			return { handled: true, requestId, status: (await submitFromVendor(req, updated)).status };
		}
		default:
			await writeKyc(req, request, kyc, signals);
			return { handled: true, requestId, status: request.status as VerificationStatus };
	}
```

Guards before all of that, each of which returns `{ handled: false, requestId: null, status: null }` rather than throwing, so the job is not retried five times over a state that will never change:

```ts
	const found = await req.payload.find({
		collection: "verification-requests", depth: 0, limit: 1, overrideAccess: true, req,
		where: { "kyc.sessionRef": { equals: sessionRef } },
	});
	const request = found.docs[0];
	if (!request) return NOOP;                       // session we do not know
	if (isTerminal(request.status)) return NOOP;      // already decided or revoked
	if (request.kyc?.decidedAt && request.kyc.status === result.status) return NOOP;  // replayed event
```

`autoApprove` calls the same code path as a reviewer approval, with `actor: null`, `actorRole: "system"` and `metadata.automatic: true`.

Register the task in `jobs/index.ts` and in `payload.config.ts` with `retries: 5`, on the default queue (it must run promptly, not nightly).

- [ ] **Step 4: Write `startKycSession` in `services/verification.ts`**

```ts
export async function startKycSession(
	payload: Payload,
	actor: ServiceUser,
	requestId: string,
	input: { consentVersion: string; locale: "fr" | "en" },
): Promise<{ url: string; expiresAt: string }> {
	return withTransaction(payload, async (req) => {
		const settings = await getVerificationSettings(payload);
		if (!settings.enabled) throw error(ERROR_CODES.verificationDisabled, 403);

		const request = await loadRequest(req, requestId);
		if (relationId(request.submittedBy) !== actor.id) throw error(ERROR_CODES.verificationNotOwner, 403);
		if (request.requestedLevel !== 2 || request.status !== "draft") {
			throw error(ERROR_CODES.verificationInvalidTransition, 409);
		}
		// The consent text and the recorded authorisation must be the same
		// version: a seller cannot consent to a notice we have since replaced.
		if (!settings.consentVersion || input.consentVersion !== settings.consentVersion) {
			throw error(ERROR_CODES.verificationConsentRequired, 409);
		}

		const attempts = (request.kyc?.attempts ?? 0) + 1;
		if (attempts > 3) throw error(ERROR_CODES.verificationTooManyAttempts, 429);
		if (await ownerSessionsInWindow(req, actor.id) >= 5) {
			throw error(ERROR_CODES.verificationTooManyAttempts, 429);
		}

		const session = await getKycProvider(settings.kycProvider).createSession({
			reference: `VR-${request.id}-${attempts}`,
			locale: input.locale,
			returnUrl: `${process.env.PUBLIC_WEB_URL ?? ""}/seller/verification/identity/return?request=${request.id}`,
		});

		await req.payload.update({
			collection: "verification-requests", id: request.id, req,
			overrideAccess: true, context: VERIFICATION_CONTEXT,
			data: {
				consent: { acceptedAt: new Date().toISOString(), version: input.consentVersion, locale: input.locale },
				kyc: {
					...(request.kyc ?? {}),
					provider: settings.kycProvider,
					sessionRef: session.sessionRef,
					status: "pending",
					attempts,
				},
			} as never,
		});

		// The hosted URL is not stored: it is a bearer credential for the
		// session, and it is handed to exactly one caller, once.
		return { url: session.url, expiresAt: session.expiresAt.toISOString() };
	}, { user: actor, context: VERIFICATION_CONTEXT });
}
```

- [ ] **Step 5: Write the webhook route**

Create `packages/api/src/app/(frontend)/api/public/verification/webhook/[provider]/route.ts`, following P0's four steps exactly as `lib/paymentWebhookRoute.ts` does:

```ts
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ provider: string }> },
) {
	const { provider } = await params;
	if (provider !== "didit" && provider !== "smileid") {
		return errorResponse(ERROR_CODES.notFound, 404);
	}

	const rawBody = await request.text();
	let event: { providerEventId: string; type: string; sessionRef: string };
	try {
		event = await getKycProvider(provider).verifyWebhook(rawBody, request.headers);
	} catch (error) {
		// Never echo why: a signature oracle is a signature oracle.
		console.warn(`[verification:webhook:${provider}] rejected`);
		return errorResponse(ERROR_CODES.forbidden, 403);
	}

	const payload = await getPayload({ config });
	let recorded: { id: string; duplicate: boolean };
	try {
		recorded = await recordWebhookEvent(payload, {
			provider,
			event: { providerEventId: event.providerEventId, type: event.type, reference: event.sessionRef, providerTransactionId: event.sessionRef },
			raw: safeJson(rawBody),
			rawBody,
		});
	} catch (error) {
		// 500 so the vendor retries: an event we failed to store is an event we
		// would otherwise lose for good.
		console.error(`[verification:webhook:${provider}] could not record`, error);
		return errorResponse(ERROR_CODES.server, 500);
	}

	if (!recorded.duplicate) {
		await payload.jobs.queue({
			task: "processKycEvent",
			input: { webhookEventId: recorded.id, provider, sessionRef: event.sessionRef },
		});
	}

	return Response.json({ received: true });
}
```

- [ ] **Step 6: Verify and commit**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/kyc-event.int.spec.ts && bun run check-types
git add packages/api/src/jobs/processKycEvent.ts packages/api/src/jobs/index.ts packages/api/src/payload.config.ts packages/api/src/services/verification.ts "packages/api/src/app/(frontend)/api/public/verification/webhook/[provider]/route.ts" packages/api/tests/int/kyc-event.int.spec.ts
git commit -m "feat(api): process vendor KYC results without storing document numbers or birth dates"
```

---

### Task 12: Document upload, duplicate detection and deletion

**Files:**
- Create: `packages/api/src/services/verificationDocuments.ts`
- Test: `packages/api/tests/int/verification-document-service.int.spec.ts`

**Interfaces:**
- Consumes: `sha256` (Task 3), `MAX_DOCUMENTS_PER_REQUEST`, `DOCUMENT_KINDS`, `withTransaction`, `ServiceError`.
- Produces:
  - `REQUIRED_DOCUMENTS: Record<BusinessType, readonly DocumentKind[]>` and `requiredDocumentKinds(business): DocumentKind[]`
  - `addDocument(payload, actor, requestId, file: { data: Buffer; name: string; mimetype: string; size: number }, kind): Promise<VerificationDocument>`
  - `removeDocument(payload, actor, requestId, documentId): Promise<void>`
  - `purgeDocumentFiles(payload, where, now): Promise<string[]>`
  - `missingDocumentKinds(business, documents): DocumentKind[]`

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/int/verification-document-service.int.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	addDocument, missingDocumentKinds, removeDocument, requiredDocumentKinds,
} from "../../src/services/verificationDocuments";
import { fakePayload } from "./helpers/fakePayload";

const OWNER = { id: "u-1", role: "user", name: "Aïcha" };
const file = (content: string) => ({
	data: Buffer.from(content), name: "rccm.pdf", mimetype: "application/pdf", size: content.length,
});

function seed(documents: Record<string, unknown>[] = []) {
	return fakePayload(
		{
			users: [{ ...OWNER }, { id: "u-2", role: "user", name: "Autre" }],
			shops: [
				{ id: "s-1", handle: "akwa", owner: "u-1", status: "active", level: 2 },
				{ id: "s-2", handle: "autre", owner: "u-2", status: "active", level: 2 },
			],
			"verification-requests": [{
				id: "vr-1", shop: "s-1", submittedBy: "u-1", requestedLevel: 3, status: "draft", openKey: "s-1:3",
			}],
			"verification-documents": documents,
		},
		{ globals: { "app-settings": { verification: { enabled: true, authorisation: { consentVersion: "v1" } } } } },
	);
}

const docs = (p: ReturnType<typeof seed>) => p.store["verification-documents"];

describe("requiredDocumentKinds", () => {
	it("asks an entreprenant for the declaration and the NIU certificate", () => {
		expect(requiredDocumentKinds({ businessType: "entreprenant", legalRepresentativeIsOwner: true }))
			.toEqual(["entreprenant_declaration", "niu_certificate"]);
	});

	it("asks every registered form for the RCCM extract and the NIU certificate", () => {
		for (const businessType of ["sole_trader", "company", "cooperative"] as const) {
			expect(requiredDocumentKinds({ businessType, legalRepresentativeIsOwner: true }))
				.toEqual(["rccm_extract", "niu_certificate"]);
		}
	});

	it("adds the representative's ID and the mandate when the owner is not the representative", () => {
		expect(requiredDocumentKinds({ businessType: "company", legalRepresentativeIsOwner: false }))
			.toEqual(["rccm_extract", "niu_certificate", "legal_representative_id", "mandate"]);
	});

	it("names exactly what is still missing", () => {
		const business = { businessType: "company" as const, legalRepresentativeIsOwner: true };
		expect(missingDocumentKinds(business, [{ kind: "rccm_extract" }])).toEqual(["niu_certificate"]);
		expect(missingDocumentKinds(business, [{ kind: "rccm_extract" }, { kind: "niu_certificate" }])).toEqual([]);
	});
});

describe("addDocument", () => {
	it("stores the sha256, the original filename and the uploader", async () => {
		const payload = seed();
		const doc = await addDocument(payload, OWNER, "vr-1", file("hello"), "rccm_extract");
		expect(doc).toMatchObject({ kind: "rccm_extract", shop: "s-1", request: "vr-1", uploadedBy: "u-1", originalFilename: "rccm.pdf" });
		expect(doc.sha256).toMatch(/^[0-9a-f]{64}$/);
	});

	it("links a file already uploaded on another shop", async () => {
		const payload = seed();
		const first = await addDocument(payload, OWNER, "vr-1", file("same"), "rccm_extract");
		payload.store["verification-requests"].push({
			id: "vr-2", shop: "s-2", submittedBy: "u-2", requestedLevel: 3, status: "draft", openKey: "s-2:3",
		});
		const second = await addDocument(payload, { id: "u-2", role: "user", name: "Autre" }, "vr-2", file("same"), "rccm_extract");
		expect(second.duplicateOf).toEqual([first.id]);
	});

	it("does not link the same shop's own earlier upload", async () => {
		const payload = seed();
		await addDocument(payload, OWNER, "vr-1", file("same"), "rccm_extract");
		const second = await addDocument(payload, OWNER, "vr-1", file("same"), "proof_of_address");
		expect(second.duplicateOf).toEqual([]);
	});

	it("refuses an eleventh document", async () => {
		const payload = seed();
		for (let i = 0; i < 10; i++) await addDocument(payload, OWNER, "vr-1", file(`f${i}`), "other");
		await expect(addDocument(payload, OWNER, "vr-1", file("f10"), "other"))
			.rejects.toMatchObject({ code: "verification.documentLimit", status: 409 });
	});

	it("refuses anyone but the owner, and any status but draft or needs_info", async () => {
		const payload = seed();
		await expect(addDocument(payload, { id: "u-2", role: "user", name: "Autre" }, "vr-1", file("x"), "other"))
			.rejects.toMatchObject({ code: "verification.notOwner", status: 403 });

		payload.store["verification-requests"][0].status = "in_review";
		await expect(addDocument(payload, OWNER, "vr-1", file("x"), "other"))
			.rejects.toMatchObject({ code: "verification.invalidTransition", status: 409 });
	});
});

describe("removeDocument", () => {
	it("deletes the row for the owner in draft", async () => {
		const payload = seed();
		const doc = await addDocument(payload, OWNER, "vr-1", file("x"), "other");
		await removeDocument(payload, OWNER, "vr-1", doc.id);
		expect(docs(payload)).toHaveLength(0);
	});

	it("refuses a document belonging to another request", async () => {
		const payload = seed([{ id: "vd-x", request: "vr-other", shop: "s-2", kind: "other" }]);
		await expect(removeDocument(payload, OWNER, "vr-1", "vd-x"))
			.rejects.toMatchObject({ code: "generic.notFound", status: 404 });
	});
});
```

- [ ] **Step 2: Run to verify it fails, then write `services/verificationDocuments.ts`**

Key parts:

```ts
export const REQUIRED_DOCUMENTS = {
	entreprenant: ["entreprenant_declaration", "niu_certificate"],
	sole_trader: ["rccm_extract", "niu_certificate"],
	company: ["rccm_extract", "niu_certificate"],
	cooperative: ["rccm_extract", "niu_certificate"],
} as const satisfies Record<BusinessType, readonly DocumentKind[]>;

export function requiredDocumentKinds(business: {
	businessType: BusinessType | null | undefined;
	legalRepresentativeIsOwner?: boolean | null;
}): DocumentKind[] {
	if (!business.businessType) return [];
	const base = [...REQUIRED_DOCUMENTS[business.businessType]];
	if (business.legalRepresentativeIsOwner === false) {
		base.push("legal_representative_id", "mandate");
	}
	return base;
}

export function missingDocumentKinds(
	business: Parameters<typeof requiredDocumentKinds>[0],
	documents: { kind: DocumentKind | string }[],
): DocumentKind[] {
	const present = new Set(documents.map((d) => d.kind));
	return requiredDocumentKinds(business).filter((kind) => !present.has(kind));
}
```

`addDocument` runs in a transaction: guard (owner, status in `draft | needs_info`, count under `MAX_DOCUMENTS_PER_REQUEST`), compute `sha256(file.data)`, find earlier documents with the same hash **on another shop** (`shop: { not_equals: shopId }`), create through `payload.create({ collection: "verification-documents", file: { ...file, name: `${randomUUID()}${extname(file.name)}` }, overrideAccess: true, context: VERIFICATION_CONTEXT, data: { request, shop, kind, sha256, originalFilename: file.name, uploadedBy, duplicateOf } })`.

`purgeDocumentFiles` deletes the stored file through `payload.delete` on a clone whose `data` is untouched — no: it must keep the row and drop the file, so it calls the adapter-agnostic path Payload exposes for that, `payload.update({ collection, id, data: { purgedAt }, file: null })` is not sufficient. Implement it as: delete the underlying file via `payload.db`'s upload adapter handler exposed on the collection (`payload.collections["verification-documents"].config.upload`), then `payload.update` the row with `purgedAt`, `filename: null`, `mimeType: null`, `filesize: null`. Task 16 tests it end to end.

- [ ] **Step 3: Verify and commit**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-document-service.int.spec.ts && bun run check-types
git add packages/api/src/services/verificationDocuments.ts packages/api/tests/int/verification-document-service.int.spec.ts
git commit -m "feat(api): add verification document uploads with cross-shop duplicate detection"
```

---

### Task 13: Seller routes

**Files:**
- Create: `packages/api/src/app/(frontend)/api/shops/[id]/verification/route.ts`
- Create: `packages/api/src/app/(frontend)/api/shops/[id]/verification-requests/route.ts`
- Create: `packages/api/src/app/(frontend)/api/verification-requests/[id]/route.ts`, `business/route.ts`, `submit/route.ts`, `kyc-session/route.ts`, `documents/route.ts`, `documents/[docId]/route.ts`
- Create: `packages/api/src/lib/verificationView.ts`
- Test: `packages/api/tests/int/verification-seller-routes.int.spec.ts`

**Interfaces:**
- Consumes: `requireUser`, `readBody`, `handleServiceError`, `toServiceUser` (`lib/shopRoute.ts`), every `services/verification.ts` export, `shopCapabilities`.
- Produces:
  - `toOwnerRequest(request: VerificationRequest, documents): OwnerVerificationRequest` in `lib/verificationView.ts`
  - The eight routes listed in the spec, answering the `ShopVerificationResponse` contract above.

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/int/verification-seller-routes.int.spec.ts`. It exercises the handlers directly (the pattern the other route specs use), covering:

```ts
describe("GET /api/shops/{id}/verification", () => {
	it("answers with the capabilities, the per-level requests and what the next level unlocks", async () => { /* … */ });

	it("keeps answering when the feature is off, with enabled:false", async () => {
		// The flag gates creation, never access to what already exists. A seller
		// mid-flight when the flag is switched off must still see where they
		// stand — this is the exact shape of the bug that cost P1 a fix round.
		const response = await GET(request("/api/shops/s-1/verification"), { params: Promise.resolve({ id: "s-1" }) });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ enabled: false, capabilities: { effectiveLevel: 2 } });
	});

	it("refuses a caller who is not the owner", async () => { /* 403 verification.notOwner */ });

	it("strips every reviewer-only field from the owner's own request", async () => {
		const body = await (await GET(/* … */)).json();
		const serialised = JSON.stringify(body);
		for (const key of ["reviewSignals", "assignee", "claimedAt", "internalNote", "checklist", "documentNumberHash", "faceMatchScore", "vendorWarnings", "vendorReviewUrl"]) {
			expect(serialised).not.toContain(key);
		}
	});

	it("agrees with Payload's own REST answer for the same owner", async () => {
		// The shaped route and the generic collection route must not disagree
		// about what an owner may read: P1 shipped a shaped endpoint that was
		// correct while the generic route beside it leaked the same field.
		const shaped = await (await GET(/* … */)).json();
		const generic = await payload.find({
			collection: "verification-requests", user: ownerUser, overrideAccess: false,
			where: { id: { equals: "vr-1" } },
		});
		const leaked = Object.keys(generic.docs[0]).filter((key) =>
			["reviewSignals", "assignee", "claimedAt"].includes(key),
		);
		expect(leaked).toEqual([]);
		expect(shaped.requests.level2.id).toBe(generic.docs[0].id);
	});
});

describe("write routes", () => {
	it("returns 403 verification.disabled for every write while the flag is off", async () => {
		for (const call of [openRequestRoute, kycSessionRoute, businessRoute, submitRoute, documentsRoute]) {
			const response = await call();
			expect(response.status).toBe(403);
			expect(await response.json()).toMatchObject({ code: "verification.disabled" });
		}
	});

	it("refuses a level-3 request before level 2 is effective", async () => { /* 409 verification.levelNotEligible */ });
	it("refuses a second open request for the same level", async () => { /* returns the existing draft, 200 */ });
	it("refuses during a cooldown", async () => { /* 429 verification.cooldown */ });
	it("validates and normalises the business group", async () => {
		// "  rc/dla/2020/b/1234 " -> "RC/DLA/2020/B/1234"; " m0123 45678901x " -> "M012345678901X"
	});
	it("refuses a business group missing a required field with verification.fieldsInvalid", async () => { /* 400 */ });
	it("refuses an unknown document kind and a type outside the four", async () => { /* 400 */ });
	it("refuses submit while a required document is missing", async () => { /* 409 verification.documentsMissing */ });
	it("deletes a draft and its documents", async () => { /* 204, documents gone */ });
	it("refuses to delete a submitted request", async () => { /* 409 verification.invalidTransition */ });
});
```

- [ ] **Step 2: Run to verify it fails, then write `lib/verificationView.ts`**

```ts
import type { VerificationDocument, VerificationRequest } from "../payload-types";

/**
 * The owner's view of a request. Reviewer-only fields are omitted entirely
 * rather than nulled: a client that receives `assignee: null` cannot tell "no
 * reviewer yet" from "not your business", and one of those is a UI state.
 *
 * This must agree with the field-level `read` rules on the collection, which
 * is what Payload's own REST route enforces. Both are tested against each
 * other in verification-seller-routes.int.spec.ts.
 */
export function toOwnerRequest(
	request: VerificationRequest,
	documents: VerificationDocument[],
): OwnerVerificationRequest {
	/* … field-by-field projection … */
}
```

- [ ] **Step 3: Write the eight routes**

Each follows the P1 route shape: `requireUser` → guard → service call → `Response.json` → `handleServiceError(scope, error)`. The read route is the only one that does **not** consult `verification.enabled` as a gate; it reports it:

```ts
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const { id } = await params;

	try {
		const view = await getShopVerification(ctx.payload, ctx.user, id);
		return Response.json(view);
	} catch (error) {
		return handleServiceError("verification:read", error);
	}
}
```

Bodies are validated with zod. The business body schema, which the web and mobile forms reuse in shape:

```ts
const businessSchema = z
	.object({
		businessType: z.enum(BUSINESS_TYPES),
		legalName: z.string().trim().min(2).max(120),
		tradeName: z.string().trim().max(120).nullish(),
		rccmNumber: z.string().trim().regex(/^[A-Z0-9/.\- ]{8,40}$/i).nullish(),
		entreprenantDeclarationNumber: z.string().trim().regex(/^[A-Z0-9/.\- ]{8,40}$/i).nullish(),
		niu: z.string().trim().regex(/^[A-Za-z0-9]{14}$/),
		registeredAddress: z.string().trim().min(1).max(500),
		city: z.string().trim().min(1).max(80),
		legalRepresentativeName: z.string().trim().min(2).max(120),
		legalRepresentativeIsOwner: z.boolean(),
	})
	.refine(
		(v) => (v.businessType === "entreprenant" ? Boolean(v.entreprenantDeclarationNumber) : Boolean(v.rccmNumber)),
		{ message: "registration number required", path: ["rccmNumber"] },
	);
```

A `niu` that parses but does not match `NIU_PATTERN` is accepted and produces the `niu_format` signal — the schema deliberately checks only the character class and the length.

- [ ] **Step 4: Verify and commit**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-seller-routes.int.spec.ts && bun run check-types
git add "packages/api/src/app/(frontend)/api/shops/[id]/verification" "packages/api/src/app/(frontend)/api/shops/[id]/verification-requests" "packages/api/src/app/(frontend)/api/verification-requests" packages/api/src/lib/verificationView.ts packages/api/tests/int/verification-seller-routes.int.spec.ts
git commit -m "feat(api): add the seller verification routes"
```

---

### Task 14: Reviewer queue, detail and decision routes

**Files:**
- Create: `packages/api/src/app/(frontend)/api/moderation/verification/route.ts`, `[id]/route.ts`
- Modify: `packages/api/src/app/(frontend)/api/moderation/summary/route.ts`
- Create: `packages/api/src/lib/verificationQueue.ts`
- Test: `packages/api/tests/int/verification-reviewer-routes.int.spec.ts`

**Interfaces:**
- Consumes: `requireModerator`, `readJson`, `handleModerationError` (`lib/moderationRoute.ts`), every decision function from `services/verification.ts`.
- Produces:
  - `queueWhere(queue: "to_review" | "mine" | "needs_info" | "decided", actorId, now): Where` and `queueSort(queue): string` in `lib/verificationQueue.ts`
  - `GET /api/moderation/verification`, `GET|POST /api/moderation/verification/{id}`
  - `moderation/summary` gains `pendingVerifications`, included in `total`
  - `viewer` block on the detail response (`canClaim`, `canDecide`, `isAssignee`, `isAdmin`, `conflictOfInterest`)

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/int/verification-reviewer-routes.int.spec.ts`, covering:

```ts
describe("queueWhere", () => {
	it("puts submitted requests in to_review, oldest first, resubmissions ahead", () => { /* … */ });
	it("scopes mine to the caller's own claims", () => {
		expect(queueWhere("mine", "m-1", NOW)).toMatchObject({
			and: expect.arrayContaining([{ status: { equals: "in_review" } }, { assignee: { equals: "m-1" } }]),
		});
	});
	it("limits decided to the last 30 days", () => { /* … */ });
});

describe("GET /api/moderation/verification", () => {
	it("keeps working while the feature flag is off", async () => {
		// Reviewers finish in-flight work whatever the flag says.
		expect((await GET(requestWith({ verification: { enabled: false } }))).status).toBe(200);
	});
	it("refuses a non-moderator with moderation.forbidden", async () => { /* 403 */ });
	it("returns the signal codes and the age for each row", async () => { /* … */ });
	it("filters by level and by signal", async () => { /* … */ });
});

describe("GET /api/moderation/verification/{id}", () => {
	it("returns the request, the shop, the owner, the other requests and the log history", async () => { /* … */ });
	it("returns document metadata with no URLs", async () => {
		const body = await (await GET(/* … */)).json();
		expect(body.request.documents[0]).toMatchObject({ id: expect.any(String), kind: "rccm_extract" });
		expect(JSON.stringify(body)).not.toContain("http");
	});
	it("states the caller's own standing rather than leaving it to be inferred", async () => {
		// P1 shipped a client that read a permission off whether a value was
		// present. The API says what the caller may do; the client renders it.
		const asOther = await (await GET(asModerator("m-2"))).json();
		expect(asOther.viewer).toEqual({
			canClaim: false, canDecide: false, isAssignee: false, isAdmin: false, conflictOfInterest: false,
		});
		const asAssignee = await (await GET(asModerator("m-1"))).json();
		expect(asAssignee.viewer).toMatchObject({ canDecide: true, isAssignee: true });
	});
	it("reports conflictOfInterest for a reviewer who is a member of the shop", async () => { /* … */ });
});

describe("POST /api/moderation/verification/{id}", () => {
	it("claims, releases, requests info, approves, rejects and revokes", async () => { /* one case each */ });
	it("lets one of two simultaneous claims win with 409 for the other", async () => { /* … */ });
	it("returns 400 verification.checklistIncomplete for a level-3 approval missing an item", async () => { /* … */ });
	it("returns 403 verification.notAssignee for a decision by another reviewer", async () => { /* … */ });
	it("returns 400 for an unknown action", async () => { /* generic.badRequest */ });
	it("refuses force:true from a non-admin", async () => { /* 403 moderation.forbidden */ });
});

describe("moderation/summary", () => {
	it("counts submitted requests plus claims idle for 48 hours, and adds them to the total", async () => {
		const body = await (await GET(request)).json();
		expect(body).toMatchObject({ pendingVerifications: 3 });
		expect(body.total).toBe(body.pendingListings + body.pendingReports + body.pendingVerifications);
	});
});
```

- [ ] **Step 2: Run to verify it fails, then write `lib/verificationQueue.ts`**

```ts
import type { Where } from "payload";

const STALE_CLAIM_MS = 48 * 3_600_000;
const DECIDED_WINDOW_MS = 30 * 86_400_000;

export type QueueKey = "to_review" | "mine" | "needs_info" | "decided";

export function queueWhere(queue: QueueKey, actorId: string, now: Date): Where {
	switch (queue) {
		case "mine":
			return { and: [{ status: { equals: "in_review" } }, { assignee: { equals: actorId } }] };
		case "needs_info":
			return { status: { equals: "needs_info" } };
		case "decided":
			return {
				and: [
					{ status: { in: ["approved", "rejected", "revoked", "expired"] } },
					{ updatedAt: { greater_than: new Date(now.getTime() - DECIDED_WINDOW_MS).toISOString() } },
				],
			};
		default:
			return { status: { equals: "submitted" } };
	}
}

/**
 * Resubmissions first, then oldest first. A seller who answered a reviewer's
 * question has already waited once; leaving them behind every new arrival is
 * how a queue teaches people not to answer.
 */
export function queueSort(queue: QueueKey): string {
	return queue === "decided" ? "-updatedAt" : "submittedAt";
}

/** `submitted`, plus claims nobody has touched for 48 hours. */
export function pendingVerificationsWhere(now: Date): Where {
	return {
		or: [
			{ status: { equals: "submitted" } },
			{
				and: [
					{ status: { equals: "in_review" } },
					{ claimedAt: { less_than: new Date(now.getTime() - STALE_CLAIM_MS).toISOString() } },
				],
			},
		],
	};
}
```

- [ ] **Step 3: Write the three routes**

The decision route dispatches on `action`, and computes `viewer` server-side:

```ts
const ACTIONS = {
	claim: (ctx, id, body) => claimRequest(ctx.payload, ctx.actor, id, { force: body.force === true }),
	release: (ctx, id) => releaseRequest(ctx.payload, ctx.actor, id),
	request_info: (ctx, id, body) => requestInfo(ctx.payload, ctx.actor, id, { reasonCode: body.reasonCode, message: body.sellerMessage }),
	approve: (ctx, id, body) => approveRequest(ctx.payload, ctx.actor, id, { note: body.note, checklist: body.checklist }),
	reject: (ctx, id, body) => rejectRequest(ctx.payload, ctx.actor, id, { reasonCode: body.reasonCode, sellerMessage: body.sellerMessage, note: body.note }),
	revoke: (ctx, id, body) => revokeRequest(ctx.payload, ctx.actor, id, { reasonCode: body.reasonCode, note: body.note }),
} as const;
```

`force: true` from a non-admin returns `moderation.forbidden` 403 before the service is reached.

Extend `moderation/summary` with a third `payload.count` using `pendingVerificationsWhere(new Date())`, and add it to `total`.

- [ ] **Step 4: Verify and commit**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-reviewer-routes.int.spec.ts && bun run check-types
git add "packages/api/src/app/(frontend)/api/moderation/verification" "packages/api/src/app/(frontend)/api/moderation/summary/route.ts" packages/api/src/lib/verificationQueue.ts packages/api/tests/int/verification-reviewer-routes.int.spec.ts
git commit -m "feat(api): add the reviewer verification queue, detail and decision routes"
```

---

### Task 15: The logged document-view route

**Files:**
- Create: `packages/api/src/app/(frontend)/api/moderation/verification/documents/[docId]/view/route.ts`
- Test: `packages/api/tests/int/verification-document-view.int.spec.ts`

**Interfaces:**
- Consumes: `requireModerator`, `createSignedDocumentUrl` (Task 4), `peppered` (Task 3), `getClientIp` (`lib/clientIp.ts`).
- Produces: `POST /api/moderation/verification/documents/{docId}/view` → `SignedDocumentUrl`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { POST } from "../../src/app/(frontend)/api/moderation/verification/documents/[docId]/view/route";

describe("POST …/documents/{docId}/view", () => {
	it("writes the view row before it returns the URL", async () => {
		const payload = seed();
		const order: string[] = [];
		const create = payload.create;
		payload.create = async (args) => { order.push(args.collection); return create(args); };
		vi.mock("@/lib/privateFiles", () => ({
			createSignedDocumentUrl: async () => { order.push("signed-url"); return { url: "https://x/y", expiresAt: new Date() }; },
		}));

		await POST(asAssignee(), { params: Promise.resolve({ docId: "vd-1" }) });
		expect(order).toEqual(["verification-document-views", "signed-url"]);
	});

	it("returns no URL at all when the view row cannot be written", async () => {
		const payload = seed();
		payload.create = async (args) => {
			if (args.collection === "verification-document-views") throw new Error("mongo down");
			throw new Error("unexpected");
		};
		const response = await POST(asAssignee(), { params: Promise.resolve({ docId: "vd-1" }) });
		expect(response.status).toBe(500);
		expect(await response.text()).not.toContain("http");
	});

	it("records the viewer, their role, the hashed IP and a truncated user agent", async () => {
		const payload = seed();
		await POST(asAssignee({ ip: "41.202.1.5", userAgent: "M".repeat(400) }), { params: Promise.resolve({ docId: "vd-1" }) });
		const row = payload.store["verification-document-views"][0];
		expect(row).toMatchObject({ document: "vd-1", request: "vr-1", viewer: "m-1", viewerRole: "moderator" });
		expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
		expect(row.ipHash).not.toContain("41.202");
		expect(String(row.userAgent)).toHaveLength(200);
	});

	it("refuses a moderator who is not the assignee, and lets an admin through", async () => {
		expect((await POST(asOtherModerator(), { params: Promise.resolve({ docId: "vd-1" }) })).status).toBe(403);
		expect((await POST(asAdmin(), { params: Promise.resolve({ docId: "vd-1" }) })).status).toBe(200);
	});

	it("asks for a 60-second URL", async () => {
		const spy = vi.fn(async () => ({ url: "https://x/y", expiresAt: new Date(Date.now() + 60_000) }));
		vi.doMock("@/lib/privateFiles", () => ({ createSignedDocumentUrl: spy }));
		await POST(asAssignee(), { params: Promise.resolve({ docId: "vd-1" }) });
		expect(spy.mock.calls[0][1]).toBe(60);
	});

	it("refuses a purged document with 404", async () => { /* … */ });
	it("refuses a non-moderator with 403", async () => { /* … */ });
});
```

- [ ] **Step 2: Write the route**

```ts
/**
 * The only door to an identity document. The view row is written first and
 * the URL is minted only if that write succeeded — a document that can be
 * opened without leaving a record would make the whole audit trail a
 * suggestion.
 */
export async function POST(request: Request, { params }: { params: Promise<{ docId: string }> }) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const { docId } = await params;

	try {
		const doc = await ctx.payload.findByID({
			collection: "verification-documents", id: docId, depth: 0, overrideAccess: true,
		}).catch(() => null);
		if (!doc || doc.purgedAt) return errorResponse(ERROR_CODES.notFound, 404);

		const verificationRequest = await ctx.payload.findByID({
			collection: "verification-requests", id: relationId(doc.request) ?? "", depth: 0, overrideAccess: true,
		});
		const isAdminCaller = ctx.actor.role === "admin";
		if (!isAdminCaller && relationId(verificationRequest.assignee) !== ctx.actor.id) {
			return errorResponse(ERROR_CODES.verificationNotAssignee, 403);
		}

		await ctx.payload.create({
			collection: "verification-document-views",
			overrideAccess: true,
			context: VERIFICATION_CONTEXT,
			data: {
				document: doc.id,
				request: verificationRequest.id,
				viewer: ctx.actor.id,
				viewerRole: ctx.actor.role ?? "moderator",
				ipHash: peppered(getClientIp(request) ?? "unknown"),
				userAgent: (request.headers.get("user-agent") ?? "").slice(0, 200),
			},
		});

		const signed = await createSignedDocumentUrl(
			{ id: String(doc.id), filename: String(doc.filename), mimeType: doc.mimeType, prefix: "verification" },
			60,
		);
		return Response.json({
			url: signed.url,
			expiresAt: signed.expiresAt.toISOString(),
			mimeType: String(doc.mimeType ?? "application/octet-stream"),
		});
	} catch (error) {
		return handleModerationError("verification:document-view", error);
	}
}
```

- [ ] **Step 3: Verify and commit**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-document-view.int.spec.ts && bun run check-types
git add "packages/api/src/app/(frontend)/api/moderation/verification/documents" packages/api/tests/int/verification-document-view.int.spec.ts
git commit -m "feat(api): serve verification documents only through a logged 60-second signed URL"
```

---

### Task 16: Retention, the purge job and account deletion

**Files:**
- Create: `packages/api/src/lib/verificationRetention.ts`, `packages/api/src/jobs/purgeVerificationData.ts`
- Modify: `packages/api/src/jobs/index.ts`, `packages/api/src/payload.config.ts`, `packages/api/src/services/accountDeletion.ts`
- Test: `packages/api/tests/int/verification-retention.int.spec.ts`

**Interfaces:**
- Consumes: `purgeDocumentFiles` (Task 12), `getKycProvider` (Task 10), `expireRequest` (Task 8).
- Produces:
  - `RETENTION` (the periods as data), `documentPurgeDueAt(request, now)`, `rowStripDueAt(request)`, `vendorDeletionDueAt(request)`
  - `purgeVerificationData(payload, now?): Promise<PurgeReport>` where `PurgeReport = { filesPurged: string[]; rowsStripped: string[]; vendorDeleted: string[]; vendorRetried: string[]; viewsDeleted: number; expiringNotified: string[] }`
  - `purgeVerificationDataTask` on the `nightly` queue

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/int/verification-retention.int.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { purgeVerificationData } from "../../src/jobs/purgeVerificationData";
import { documentPurgeDueAt, RETENTION, rowStripDueAt, vendorDeletionDueAt } from "../../src/lib/verificationRetention";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2027-01-01T00:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("retention periods", () => {
	it("declares the periods the processing register names", () => {
		expect(RETENTION).toMatchObject({
			documentsAfterTerminalDays: 90,
			documentsAfterFraudRevocationDays: 365,
			requestRowYears: 5,
			documentViewYears: 3,
			vendorDeletionAfterDecisionDays: 30,
			hashesAfterAccountDeletionDays: 365,
		});
	});

	it("keeps an approved request's files until it leaves approved", () => {
		expect(documentPurgeDueAt({ status: "approved", updatedAt: days(400) }, NOW)).toBeNull();
	});

	it("purges 90 days after an ordinary terminal status", () => {
		expect(documentPurgeDueAt({ status: "rejected", updatedAt: days(91) }, NOW)?.getTime())
			.toBeLessThanOrEqual(NOW.getTime());
		expect(documentPurgeDueAt({ status: "rejected", updatedAt: days(89) }, NOW)?.getTime())
			.toBeGreaterThan(NOW.getTime());
	});

	it("keeps a fraud revocation's files for a year", () => {
		const fraud = { status: "revoked", updatedAt: days(100), decision: { reasonCode: "fraud" } };
		expect(documentPurgeDueAt(fraud, NOW)!.getTime()).toBeGreaterThan(NOW.getTime());
		expect(documentPurgeDueAt({ ...fraud, updatedAt: days(366) }, NOW)!.getTime())
			.toBeLessThanOrEqual(NOW.getTime());
		expect(documentPurgeDueAt({ ...fraud, decision: { reasonCode: "document_forged" } }, NOW)!.getTime())
			.toBeGreaterThan(NOW.getTime());
	});
});

describe("purgeVerificationData", () => {
	function seed(over: Record<string, unknown[]> = {}) {
		return fakePayload({
			users: [{ id: "u-1", role: "user", name: "Aïcha" }],
			shops: [{ id: "s-1", handle: "akwa", owner: "u-1", status: "active", level: 2, levelExpiresAt: days(-20) }],
			"verification-requests": over["verification-requests"] ?? [],
			"verification-documents": over["verification-documents"] ?? [],
			"verification-document-views": over["verification-document-views"] ?? [],
			"moderation-log": [],
		});
	}

	it("deletes the file and keeps the row with purgedAt", async () => {
		const payload = seed({
			"verification-requests": [{ id: "vr-1", shop: "s-1", submittedBy: "u-1", requestedLevel: 3, status: "rejected", updatedAt: days(91) }],
			"verification-documents": [{ id: "vd-1", request: "vr-1", shop: "s-1", kind: "rccm_extract", filename: "a.pdf", sha256: "h" }],
		});
		const report = await purgeVerificationData(payload, NOW);
		expect(report.filesPurged).toEqual(["vd-1"]);
		const doc = payload.store["verification-documents"][0];
		expect(doc).toMatchObject({ filename: null });
		expect(doc.purgedAt).toBeTruthy();
		expect(doc.sha256).toBe("h");
	});

	it("does not purge twice", async () => {
		const payload = seed({
			"verification-requests": [{ id: "vr-1", shop: "s-1", submittedBy: "u-1", requestedLevel: 3, status: "rejected", updatedAt: days(91) }],
			"verification-documents": [{ id: "vd-1", request: "vr-1", shop: "s-1", filename: null, purgedAt: days(5) }],
		});
		expect((await purgeVerificationData(payload, NOW)).filesPurged).toEqual([]);
	});

	it("strips the names and the business block five years after a terminal status", async () => {
		const payload = seed({
			"verification-requests": [{
				id: "vr-1", shop: "s-1", submittedBy: "u-1", requestedLevel: 3, status: "rejected",
				updatedAt: days(5 * 365 + 1),
				kyc: { givenNames: "Aicha", familyName: "Mbappe", documentNumberHash: "h" },
				business: { legalName: "AKWA SARL" },
				decision: { sellerMessage: "…", internalNote: "…" },
			}],
		});
		await purgeVerificationData(payload, NOW);
		const request = payload.store["verification-requests"][0];
		expect(request.kyc).toMatchObject({ givenNames: null, familyName: null, documentNumberHash: null });
		expect(request.business).toBeNull();
		expect(request.decision).toMatchObject({ sellerMessage: null, internalNote: null });
	});

	it("asks the vendor to delete 30 days after the decision and records it", async () => {
		const deleteSessionData = vi.fn(async () => undefined);
		vi.doMock("../../src/lib/kyc", () => ({ getKycProvider: () => ({ deleteSessionData }) }));
		const payload = seed({
			"verification-requests": [{
				id: "vr-1", shop: "s-1", submittedBy: "u-1", requestedLevel: 2, status: "approved",
				kyc: { provider: "didit", sessionRef: "sess-1", decidedAt: days(31), vendorDataDeletedAt: null },
			}],
		});
		const report = await purgeVerificationData(payload, NOW);
		expect(deleteSessionData).toHaveBeenCalledWith("sess-1");
		expect(report.vendorDeleted).toEqual(["vr-1"]);
		expect(payload.store["verification-requests"][0].kyc.vendorDataDeletedAt).toBeTruthy();
	});

	it("retries a failing vendor deletion on the next run instead of giving up", async () => {
		let calls = 0;
		vi.doMock("../../src/lib/kyc", () => ({
			getKycProvider: () => ({ deleteSessionData: async () => { calls += 1; if (calls === 1) throw new Error("502"); } }),
		}));
		const payload = seed({
			"verification-requests": [{
				id: "vr-1", shop: "s-1", submittedBy: "u-1", requestedLevel: 2, status: "approved",
				kyc: { provider: "didit", sessionRef: "sess-1", decidedAt: days(31), vendorDataDeletedAt: null },
			}],
		});
		expect((await purgeVerificationData(payload, NOW)).vendorRetried).toEqual(["vr-1"]);
		expect(payload.store["verification-requests"][0].kyc.vendorDataDeletedAt).toBeFalsy();
		expect((await purgeVerificationData(payload, NOW)).vendorDeleted).toEqual(["vr-1"]);
	});

	it("deletes view rows older than three years", async () => {
		const payload = seed({
			"verification-document-views": [
				{ id: "vv-1", createdAt: days(3 * 365 + 1) },
				{ id: "vv-2", createdAt: days(10) },
			],
		});
		expect((await purgeVerificationData(payload, NOW)).viewsDeleted).toBe(1);
		expect(payload.store["verification-document-views"].map((v) => v.id)).toEqual(["vv-2"]);
	});

	it("expires a lapsed approval and drops the shop's level", async () => {
		const payload = seed({
			"verification-requests": [{
				id: "vr-1", shop: "s-1", submittedBy: "u-1", requestedLevel: 2, status: "approved",
				expiresAt: days(1), openKey: null,
			}],
		});
		await purgeVerificationData(payload, NOW);
		expect(payload.store["verification-requests"][0].status).toBe("expired");
		expect(payload.store.shops[0].level).toBe(1);
	});

	it("expires a draft idle for 30 days and a needs_info unanswered for 30 days", async () => {
		const payload = seed({
			"verification-requests": [
				{ id: "vr-d", shop: "s-1", submittedBy: "u-1", requestedLevel: 3, status: "draft", openKey: "s-1:3", updatedAt: days(31) },
				{ id: "vr-n", shop: "s-1", submittedBy: "u-1", requestedLevel: 2, status: "needs_info", openKey: "s-1:2", updatedAt: days(31) },
			],
		});
		await purgeVerificationData(payload, NOW);
		expect(payload.store["verification-requests"].map((r) => r.status)).toEqual(["expired", "expired"]);
	});

	it("releases a claim idle for 48 hours back to the queue", async () => {
		const payload = seed({
			"verification-requests": [{
				id: "vr-1", shop: "s-1", submittedBy: "u-1", requestedLevel: 3, status: "in_review",
				openKey: "s-1:3", assignee: "m-1", claimedAt: days(3),
			}],
		});
		await purgeVerificationData(payload, NOW);
		expect(payload.store["verification-requests"][0]).toMatchObject({ status: "submitted", assignee: null });
		expect(payload.store["moderation-log"].at(-1)).toMatchObject({ action: "verification.release", actorRole: "system" });
	});

	it("names the shops whose level expires in 30 or 7 days, once each", async () => {
		const payload = seed();
		payload.store.shops[0].levelExpiresAt = new Date(NOW.getTime() + 30 * 86_400_000).toISOString();
		expect((await purgeVerificationData(payload, NOW)).expiringNotified).toEqual(["s-1"]);
		expect((await purgeVerificationData(payload, NOW)).expiringNotified).toEqual([]);
	});
});
```

- [ ] **Step 2: Write `lib/verificationRetention.ts` and `jobs/purgeVerificationData.ts`**

```ts
/** The periods declared in the processing register. Changing one here changes the product's promise. */
export const RETENTION = {
	documentsAfterTerminalDays: 90,
	documentsAfterFraudRevocationDays: 365,
	requestRowYears: 5,
	documentViewYears: 3,
	vendorDeletionAfterDecisionDays: 30,
	hashesAfterAccountDeletionDays: 365,
	draftIdleDays: 30,
	needsInfoIdleDays: 30,
	staleClaimHours: 48,
	expiryNoticeDays: [30, 7],
} as const;
```

The job runs each rule in its own `withTransaction`, so one rule failing does not abandon the rest, and reports what it did. Each vendor deletion is attempted independently and its failure is recorded, never swallowed:

```ts
		for (const request of dueForVendorDeletion) {
			try {
				await getKycProvider(request.kyc.provider).deleteSessionData(request.kyc.sessionRef);
				await markVendorDeleted(payload, request.id);
				report.vendorDeleted.push(String(request.id));
			} catch (error) {
				// Deliberately not marked: this runs again tomorrow, and every night
				// after that, until the vendor confirms. A "best effort, once"
				// deletion is not a deletion commitment.
				payload.logger.warn({ err: error, requestId: request.id }, "[verification] vendor deletion failed; will retry");
				report.vendorRetried.push(String(request.id));
			}
		}
```

The `expiringNotified` rule marks each notice so it fires once per threshold: store the last notified threshold in the request's `statusHistory`-adjacent metadata — concretely, a `expiryNoticesSent` json field on `shops` is not wanted; use a `moderation-log`-free marker on the backing request instead, `kyc.vendorWarnings` is the wrong place. Add a `notifiedExpiryDays` number field to `verification-requests` in Task 2's collection (`{ name: "notifiedExpiryDays", type: "number" }`), and set it to the threshold just fired.

Register the task on the `nightly` queue in `jobs/index.ts` and `payload.config.ts`, beside `expireListings`.

- [ ] **Step 3: Extend `services/accountDeletion.ts`**

Inside the existing cascade, before the shops are closed:

```ts
	// Identity documents go immediately, not on the 90-day schedule: the
	// account is gone and nothing needs them any more. The decided request
	// rows stay, stripped of names, for the fraud-prevention hash window —
	// otherwise deleting an account would erase the record that its document
	// was ever used, which is the one thing duplicate detection exists for.
	await purgeDocumentFiles(payload, { shop: { in: ownedShopIds } }, new Date());
	await clearKycNames(payload, userId, req);
	await deleteOpenRequests(payload, ownedShopIds, req);
```

with a matching test case appended to the existing `account-deletion` spec: deleting the account leaves the decided rows with `documentNumberHash` intact and `givenNames` null, and removes the open ones.

- [ ] **Step 4: Verify and commit**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-retention.int.spec.ts tests/int/account-deletion.int.spec.ts && bun run generate:types && bun run check-types
git add packages/api/src/lib/verificationRetention.ts packages/api/src/jobs/purgeVerificationData.ts packages/api/src/jobs/index.ts packages/api/src/payload.config.ts packages/api/src/services/accountDeletion.ts packages/api/src/collections/VerificationRequests.ts packages/api/src/payload-types.ts packages/api/tests/int/verification-retention.int.spec.ts
git commit -m "feat(api): purge verification data on schedule and on account deletion"
```

---

### Task 17: Notifications

**Files:**
- Create: `packages/api/src/services/verificationNotifications.ts`
- Modify: `packages/api/src/scripts/syncNotificationWorkflows.ts`, `packages/api/src/services/verification.ts`, `packages/api/src/jobs/purgeVerificationData.ts`
- Test: `packages/api/tests/int/verification-notifications.int.spec.ts`

**Interfaces:**
- Consumes: `triggerNotificationEvent` (`hooks/notificationEvents.ts`), `onCommit` (`lib/transactions.ts`).
- Produces: `notifyVerificationNeedsInfo`, `notifyVerificationApproved`, `notifyVerificationRejected`, `notifyVerificationRevoked`, `notifyVerificationExpiring` — each `(req, input) => Promise<void>`, each queued with `onCommit`.

- [ ] **Step 1: Write the failing test**

```ts
describe("verification notifications", () => {
	it("fires only after the transaction commits", async () => { /* onCommit, not inline */ });

	it("carries no document data in any payload", async () => {
		for (const trigger of triggers) {
			const body = JSON.stringify(trigger.payload);
			for (const forbidden of ["documentNumber", "sha256", "filename", "dateOfBirth", "faceMatchScore", "vendorReviewUrl"]) {
				expect(body).not.toContain(forbidden);
			}
		}
	});

	it("sends the seller message and the reason on needs_info and rejection", async () => { /* … */ });
	it("sends the date a new request is allowed on rejection", async () => { /* cooldownUntil */ });
	it("sends the new level and what it unlocks on approval", async () => { /* CAPABILITY_UNLOCKS */ });
	it("does not fire when the decision fails", async () => { /* rolled back → no trigger */ });
});

describe("syncNotificationWorkflows", () => {
	it("declares the five verification workflows on in-app, push and email", () => {
		for (const id of ["verification-needs-info", "verification-approved", "verification-rejected", "verification-revoked", "verification-expiring"]) {
			const workflow = WORKFLOWS.find((w) => w.workflowId === id);
			expect(workflow?.steps.map((s) => s.type).sort()).toEqual(["email", "in_app", "push"]);
		}
	});

	it("keeps user-verified defined for one release so stale in-app tags resolve", () => {
		expect(WORKFLOWS.some((w) => w.workflowId === "user-verified")).toBe(true);
	});
});
```

- [ ] **Step 2: Write the module and the workflow definitions**

Add the five workflows to `syncNotificationWorkflows.ts` following the existing shape, each with `in_app`, `push` and `email` steps and bilingual copy. Leave the `user-verified` definition in place with a comment saying which release removes it — deleting it now would leave in-app notifications already sent with an unresolvable workflow tag.

`services/verificationNotifications.ts` wraps each trigger in `onCommit(commitContextOf(req), () => triggerNotificationEvent({...}))`, so a rolled-back decision never notifies. Call them from the matching functions in `services/verification.ts` and from the expiry rule of `purgeVerificationData`.

- [ ] **Step 3: Verify and commit**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-notifications.int.spec.ts && bun run check-types
git add packages/api/src/services/verificationNotifications.ts packages/api/src/scripts/syncNotificationWorkflows.ts packages/api/src/services/verification.ts packages/api/src/jobs/purgeVerificationData.ts packages/api/tests/int/verification-notifications.int.spec.ts
git commit -m "feat(api): notify sellers about verification decisions and upcoming expiry"
```

---

### Task 18: Retiring `users.verified` across the API surfaces

**Files:**
- Modify: `packages/api/src/app/(frontend)/api/moderation/users/[id]/route.ts`
- Modify: `packages/api/src/components/widgets/ModerationWidget.tsx`, `views/UserManagementClient.tsx`, `views/UserActions.tsx`
- Modify: `packages/api/src/lib/publicShop.ts`, `packages/api/src/services/shops.ts` (capabilities on the shop responses)
- Test: `packages/api/tests/int/verification-user-surfaces.int.spec.ts`

**Interfaces:**
- Consumes: `shopCapabilities` (Task 1), `getVerificationSettings`.
- Produces:
  - `moderation/users/{id}` returns `identityVerifiedAt` and `shopBadge` instead of `verified`
  - `PublicShop` gains `badge: "phone" | "identity" | "business" | null`
  - `MyShopResponse` and `GET /api/shops/{id}` gain `capabilities: ShopCapabilities`
  - The admin `ModerationWidget` tile becomes "Verifications to review" fed by `pendingVerifications`; `UserManagementClient` shows "Identity verified"; `UserActions`' Verify/Unverify button is removed

- [ ] **Step 1: Write the failing test**

```ts
describe("moderation/users/{id}", () => {
	it("reports the identity date and the owned shop's badge, not a checkbox", async () => {
		const body = await (await GET(/* … */)).json();
		expect(body).toMatchObject({ identityVerifiedAt: expect.any(String), shopBadge: "identity" });
		expect(body).not.toHaveProperty("verified");
	});

	it("reports no badge for an owner whose shop is suspended", async () => {
		expect((await (await GET(/* suspended shop */)).json()).shopBadge).toBeNull();
	});
});

describe("shop responses", () => {
	it("carries capabilities on the manage response so no client recomputes them", async () => {
		const body = await (await GET("/api/shops/s-1")).json();
		expect(body.capabilities).toMatchObject({ effectiveLevel: 2, badge: "identity", teamMembers: true, maxMembers: 5 });
	});

	it("carries level and badge but no capability flags on the public lookup", async () => {
		const body = await (await GET("/api/public/shops/akwa")).json();
		expect(body).toMatchObject({ level: 2, badge: "identity" });
		expect(body).not.toHaveProperty("capabilities");
	});

	it("reports badge null and level 0 capabilities for a suspended shop", async () => { /* … */ });
});

describe("admin panel surfaces", () => {
	it("no longer queries users by the retired verified field", () => {
		const source = readFileSync("src/components/widgets/ModerationWidget.tsx", "utf8");
		expect(source).not.toContain("where[verified]");
		expect(source).toContain("pendingVerifications");
	});

	it("no longer offers a Verify button", () => {
		expect(readFileSync("src/components/views/UserActions.tsx", "utf8")).not.toMatch(/Unverify|\bVerify\b/);
	});
});
```

- [ ] **Step 2: Make the changes**

`ModerationWidget`: replace the `fetch("/api/users?where[verified][equals]=false&limit=0")` call with `fetch("/api/moderation/summary")` and read `pendingVerifications`; relabel the tile "Verifications to review" and point it at `/moderation/verification`.

`UserManagementClient`: replace the `verified` column with an "Identity verified" pill driven by `identityVerifiedAt`, and delete the inline Verify/Unverify action (the field is virtual; a `PATCH` of it is a silent no-op, which is worse than no button).

`UserActions`: delete the Verify/Unverify button and its `verified` prop; update the caller.

`lib/publicShop.ts`: add `badge` to `PublicShop` and to `serializePublicShop`, computed as `shopCapabilities(shop).badge`. `toShopSearchHit` gains `badge` the same way from the indexed `level` plus the hydrated status.

`services/shops.ts`: add `capabilities: shopCapabilities(shop)` to `getMyShop` and to `resolvePublicShop`'s manage variant.

- [ ] **Step 3: Verify and commit**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/verification-user-surfaces.int.spec.ts tests/int/shops.int.spec.ts && bun run check-types
git add "packages/api/src/app/(frontend)/api/moderation/users/[id]/route.ts" packages/api/src/components packages/api/src/lib/publicShop.ts packages/api/src/services/shops.ts packages/api/tests/int/verification-user-surfaces.int.spec.ts
git commit -m "refactor(api): replace the users.verified surfaces with shop badges and capabilities"
```

---

### Task 19: Search `minShopLevel`, public config, and the backend checkpoint

**Files:**
- Modify: `packages/api/src/app/(frontend)/api/public/search/route.ts`, `search/shops/route.ts`, `public/config/route.ts`
- Test: `packages/api/tests/int/verification-search.int.spec.ts`

**Interfaces:**
- Consumes: `quoteFilterValue` (`lib/meiliFilter.ts`), `activeShopIds` (`lib/activeShopIds.ts`), `getVerificationSettings`.
- Produces: `minShopLevel` query parameter on both search routes; `verificationEnabled` on `GET /api/public/config`.

- [ ] **Step 1: Write the failing test**

```ts
describe("minShopLevel", () => {
	it("adds a Meilisearch filter for a valid value", async () => {
		await GET(searchRequest("?minShopLevel=2"));
		expect(lastSearchCall().filter).toContain("shopLevel >= 2");
	});

	it("ignores a value outside 1–3 rather than refusing the search", async () => {
		for (const value of ["0", "4", "abc", ""]) {
			await GET(searchRequest(`?minShopLevel=${value}`));
			expect(lastSearchCall().filter ?? "").not.toContain("shopLevel");
		}
	});

	it("drops a hit whose live shop level is below the floor, even when the index says otherwise", async () => {
		// activeShopIds re-reads the shop per page; a stale indexed shopLevel of 2
		// against a live level of 1 must not survive a minShopLevel=2 search.
		indexReturns([{ id: "l-1", shopId: "s-1", shopLevel: 2 }]);
		liveShop({ id: "s-1", status: "active", level: 1 });
		const body = await (await GET(searchRequest("?minShopLevel=2"))).json();
		expect(body.hits).toEqual([]);
	});

	it("drops a hit whose shop is no longer active", async () => { /* … */ });

	it("filters the shops index the same way", async () => {
		await GET(shopsSearchRequest("?minShopLevel=3"));
		expect(lastShopsSearchCall().filter).toContain("level >= 3");
	});
});

describe("GET /api/public/config", () => {
	it("reports verificationEnabled beside shopsEnabled", async () => {
		expect(await (await GET()).json()).toMatchObject({ shopsEnabled: false, verificationEnabled: false });
	});

	it("reports false when the settings global cannot be read", async () => { /* fails closed */ });
});
```

- [ ] **Step 2: Make the changes**

In `search/route.ts`, after the existing `shopParam` handling:

```ts
	const minShopLevelParam = Number.parseInt(searchParams.get("minShopLevel") ?? "", 10);
	const minShopLevel =
		minShopLevelParam >= 1 && minShopLevelParam <= 3 ? minShopLevelParam : null;
	if (minShopLevel) filters.push(`shopLevel >= ${minShopLevel}`);
```

and, after the `activeShopIds` hydration that already prefers the live level over the indexed one, re-apply the floor:

```ts
	// The index can be stale — a level that lapsed or a shop that was suspended
	// since the last event. Hydration already corrects the value it shows; the
	// filter has to be applied again against the corrected value, or a "verified
	// shops only" search silently returns unverified shops.
	const filtered = minShopLevel
		? hydrated.filter((hit) => (hit.shopLevel ?? 0) >= minShopLevel)
		: hydrated;
```

In `search/shops/route.ts`, the same parse and `filters.push(\`level >= ${minShopLevel}\`)`. Both indexes already declare the attribute filterable (`shopLevel` on listings, `level` on shops), so no indexer change is needed.

In `public/config/route.ts`, add `verificationEnabled = (await getVerificationSettings(payload)).enabled;` inside the existing `try`, initialised to `false` outside it, and add it to the response body.

- [ ] **Step 3: Backend checkpoint**

Run the whole backend and confirm nothing beyond the five known failures:

```bash
cd packages/api && bun run generate:types && bun run check-types && bunx vitest run --config ./vitest.config.mts
cd packages/search-indexer && bun run check-types
cd /home/yvan/Workspaces/Projects/bns/bns-repo && bunx biome check packages/api/src
```

Expected: the same five pre-existing failures, no new ones.

- [ ] **Step 4: Commit**

```bash
git add "packages/api/src/app/(frontend)/api/public" packages/api/tests/int/verification-search.int.spec.ts
git commit -m "feat(api): add a minimum shop level to search and expose verificationEnabled"
```

---

## Web (Tasks 20–26)

### Task 20: Web foundations — types, error codes, query keys, badge levels

**Files:**
- Create: `packages/web/src/lib/verification.ts`, `packages/web/src/lib/verification.test.ts`
- Create: `packages/web/src/lib/apiError.locales.test.ts`
- Create: `packages/web/src/hooks/use-verification.ts`, `use-moderation-verification.ts`
- Modify: `packages/web/src/lib/apiError.ts`, `query-keys.ts`, `query-keys.test.ts`, `shop-api.ts`
- Modify: `packages/web/src/components/shop/level-badge.tsx`
- Modify: `packages/web/messages/en.json`, `fr.json`
- Test: `packages/web/src/lib/query-keys.test.ts` (extend)

**Interfaces:**
- Consumes: the API contracts block above; `normalizeApiError` (`lib/apiError.ts`); `shopScopeKey` / `isKeyCoveredBy` (`lib/query-keys.ts`).
- Produces:
  - `packages/web/src/lib/verification.ts`: the TypeScript mirrors of `ShopCapabilities`, `OwnerVerificationRequest`, `ShopVerificationResponse`, `ReviewerQueueRow`, `ReviewerRequestDetail`, `SignedDocumentUrl`; `badgeLabelKey(badge)`, `levelLadder(capabilities)`, `statusToneKey(status)`, `canOpenRequest(view, level)`, `formatRenewalWindow(view, level, now)`
  - `verificationKey(shopId)`, `verificationRequestKey(shopId, requestId)`, `moderationVerificationKeys` in `lib/query-keys.ts`
  - `useShopVerification(shopId)`, `useOpenVerificationRequest()`, `useStartKycSession()`, `useSaveBusiness()`, `useUploadVerificationDocument()`, `useDeleteVerificationDocument()`, `useSubmitVerification()`, `useDeleteVerificationDraft()` in `hooks/use-verification.ts`
  - `useVerificationQueue(queue, filters)`, `useVerificationRequest(id)`, `useVerificationDecision()`, `useDocumentUrl()` in `hooks/use-moderation-verification.ts`
  - `LevelBadge` renders `phone | identity | business`

- [ ] **Step 1: Write the failing query-key test**

Append to `packages/web/src/lib/query-keys.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
	catalogueRootKey, isKeyCoveredBy, shopScopeKey,
	verificationKey, verificationRequestKey,
} from "./query-keys";

describe("verification query keys", () => {
	it("sits under the shop scope, so a shop-wide invalidation reaches it", () => {
		expect(isKeyCoveredBy(verificationKey("s-1"), shopScopeKey("s-1"))).toBe(true);
		expect(isKeyCoveredBy(verificationRequestKey("s-1", "vr-1"), verificationKey("s-1"))).toBe(true);
	});

	it("is not a sibling of the catalogue root, so a catalogue mutation leaves it alone", () => {
		expect(isKeyCoveredBy(verificationKey("s-1"), catalogueRootKey("s-1"))).toBe(false);
	});

	it("does not collide across shops", () => {
		expect(isKeyCoveredBy(verificationKey("s-2"), verificationKey("s-1"))).toBe(false);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/web && bun test src/lib/query-keys.test.ts`
Expected: FAIL — `verificationKey` is not exported.

- [ ] **Step 3: Add the keys**

```ts
/** Everything about one shop's verification: the hub view and each request. */
export const verificationKey = (shopId: string) =>
	[...shopScopeKey(shopId), "verification"] as const;

export const verificationRequestKey = (shopId: string, requestId: string) =>
	[...verificationKey(shopId), requestId] as const;

/**
 * Reviewer keys are not shop-scoped: the queue spans shops, and invalidating
 * it on a decision must not depend on knowing which shop the request belonged
 * to.
 */
export const moderationVerificationKeys = {
	root: ["moderation", "verification"] as const,
	queue: (queue: string, filters: { level?: number; signal?: string } = {}) =>
		["moderation", "verification", "queue", queue, filters] as const,
	detail: (id: string) => ["moderation", "verification", "detail", id] as const,
	summary: ["moderation", "summary"] as const,
};
```

- [ ] **Step 4: Write the failing pure-logic test**

Create `packages/web/src/lib/verification.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
	badgeLabelKey, canOpenRequest, formatRenewalWindow, levelLadder, statusToneKey,
} from "./verification";

const view = (over: Record<string, unknown> = {}) => ({
	enabled: true,
	capabilities: {
		effectiveLevel: 1, badge: "phone", codOrders: true, protectedPayment: false,
		teamMembers: false, maxMembers: 1, supplier: false, fasterPayouts: false, legalInfoVerified: false,
	},
	levelExpiresAt: null,
	consentVersion: "kyc-2026-10-v1",
	requests: { level2: null, level3: null },
	renewableFrom: { level2: null, level3: null },
	nextLevel: { level: 2, unlocks: ["protectedPayment", "teamMembers"], eligible: true },
	cooldownUntil: null,
	...over,
});

describe("badgeLabelKey", () => {
	it("names one key per badge and nothing for none", () => {
		expect(badgeLabelKey("phone")).toBe("levelPhone");
		expect(badgeLabelKey("identity")).toBe("levelIdentity");
		expect(badgeLabelKey("business")).toBe("levelBusiness");
		expect(badgeLabelKey(null)).toBeNull();
	});
});

describe("levelLadder", () => {
	it("marks each rung reached, current or locked", () => {
		expect(levelLadder(view().capabilities).map((r) => r.state)).toEqual(["current", "locked", "locked"]);
		expect(levelLadder({ ...view().capabilities, effectiveLevel: 3 }).map((r) => r.state))
			.toEqual(["reached", "reached", "current"]);
	});
});

describe("canOpenRequest", () => {
	it("refuses while the feature is off, even when everything else is fine", () => {
		expect(canOpenRequest(view({ enabled: false }), 2)).toEqual({ ok: false, reason: "disabled" });
	});

	it("refuses level 3 before level 2", () => {
		expect(canOpenRequest(view(), 3)).toEqual({ ok: false, reason: "notEligible" });
	});

	it("refuses while a request for that level is open", () => {
		const open = { ...view(), requests: { level2: { status: "submitted" }, level3: null } };
		expect(canOpenRequest(open as never, 2)).toEqual({ ok: false, reason: "open" });
	});

	it("refuses during a cooldown and says until when", () => {
		const until = new Date(Date.now() + 3_600_000).toISOString();
		expect(canOpenRequest(view({ cooldownUntil: until }), 2)).toEqual({ ok: false, reason: "cooldown", until });
	});

	it("allows it otherwise", () => {
		expect(canOpenRequest(view(), 2)).toEqual({ ok: true });
	});

	it("allows a renewal once inside the window, and not before", () => {
		const soon = new Date(Date.now() - 1000).toISOString();
		const later = new Date(Date.now() + 86_400_000).toISOString();
		const approved = { status: "approved", expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() };
		expect(canOpenRequest(view({ requests: { level2: approved, level3: null }, renewableFrom: { level2: soon, level3: null } }) as never, 2))
			.toEqual({ ok: true });
		expect(canOpenRequest(view({ requests: { level2: approved, level3: null }, renewableFrom: { level2: later, level3: null } }) as never, 2))
			.toEqual({ ok: false, reason: "notRenewableYet", until: later });
	});
});

describe("statusToneKey", () => {
	it("maps each status to a tone a screen can colour", () => {
		expect(statusToneKey("approved")).toBe("positive");
		expect(statusToneKey("rejected")).toBe("negative");
		expect(statusToneKey("revoked")).toBe("negative");
		expect(statusToneKey("needs_info")).toBe("warning");
		expect(statusToneKey("submitted")).toBe("neutral");
		expect(statusToneKey("in_review")).toBe("neutral");
		expect(statusToneKey("draft")).toBe("neutral");
		expect(statusToneKey("expired")).toBe("neutral");
	});
});
```

- [ ] **Step 5: Write `lib/verification.ts`, then run both tests**

Implement the mirrors and the five pure functions. `canOpenRequest` returns a discriminated result, never a bare boolean, so the hub can name the reason it refuses instead of showing a disabled button with no explanation.

Run: `cd packages/web && bun test src/lib/verification.test.ts src/lib/query-keys.test.ts` → PASS.

- [ ] **Step 6: Write the locale drift test**

Create `packages/web/src/lib/apiError.locales.test.ts`, the web twin of the mobile one — web now has `bun test`, and a code translated on one client and not the other is the same bug either way:

```ts
import { describe, expect, test } from "bun:test";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { ERROR_CODES } from "./apiError";

type Json = { [key: string]: Json | string };

function leafPaths(node: Json, prefix = ""): string[] {
	return Object.entries(node).flatMap(([key, value]) => {
		const path = prefix ? `${prefix}.${key}` : key;
		return typeof value === "string" ? [path] : leafPaths(value, path);
	});
}

const apiErrorsEn = (en as unknown as Json).ApiErrors as Json;
const apiErrorsFr = (fr as unknown as Json).ApiErrors as Json;

describe("ApiErrors locale coverage", () => {
	test("every mapped error code has an English translation", () => {
		const keys = new Set(leafPaths(apiErrorsEn));
		for (const code of Object.values(ERROR_CODES)) expect(keys.has(code)).toBe(true);
	});

	test("every mapped error code has a French translation", () => {
		const keys = new Set(leafPaths(apiErrorsFr));
		for (const code of Object.values(ERROR_CODES)) expect(keys.has(code)).toBe(true);
	});

	test("the two locale files expose the same ApiErrors keys", () => {
		expect(leafPaths(apiErrorsEn).sort()).toEqual(leafPaths(apiErrorsFr).sort());
	});
});
```

- [ ] **Step 7: Add the fifteen codes and their translations**

Add the same fifteen `verification*` entries to `ERROR_CODES` and `FALLBACKS` in `packages/web/src/lib/apiError.ts`, and a `verification` block under `ApiErrors` in both `messages/en.json` and `messages/fr.json`. French, for example:

```json
			"verification": {
				"disabled": "La vérification n'est pas encore disponible.",
				"notOwner": "Seul le propriétaire de la boutique peut faire cela.",
				"levelNotEligible": "Vérifiez votre identité avant de demander la vérification de l'entreprise.",
				"requestOpen": "Une demande pour ce niveau est déjà en cours.",
				"cooldown": "Vous ne pouvez pas encore ouvrir une nouvelle demande. Réessayez plus tard.",
				"invalidTransition": "Cette demande n'est pas dans un état permettant cette action.",
				"consentRequired": "Veuillez accepter la notice de protection des données en vigueur pour continuer.",
				"tooManyAttempts": "Trop de tentatives de vérification. Réessayez plus tard.",
				"kycUnavailable": "La vérification d'identité est indisponible pour le moment. Réessayez sous peu.",
				"documentLimit": "Vous avez atteint le nombre maximum de documents pour cette demande.",
				"documentsMissing": "Certains documents obligatoires manquent encore.",
				"fieldsInvalid": "Veuillez vérifier les informations d'entreprise signalées.",
				"notAssignee": "Seul le relecteur qui a pris cette demande peut la décider.",
				"conflictOfInterest": "Vous ne pouvez pas relire une boutique à laquelle vous êtes lié.",
				"checklistIncomplete": "Chaque point de la liste doit être confirmé avant d'approuver."
			}
```

Add the same block in English, plus the `Verification` namespace holding the hub, ladder, consent, reason-code, checklist and signal copy the later tasks use.

- [ ] **Step 8: Extend `LevelBadge`**

```tsx
const BADGE_KEYS = {
	phone: "levelPhone",
	identity: "levelIdentity",
	business: "levelBusiness",
} as const;

export function LevelBadge({ badge, size = "md", className }: {
	badge: "phone" | "identity" | "business" | null | undefined;
	size?: "sm" | "md";
	className?: string;
}) {
	const t = useTranslations("Shop");
	if (!badge) return null;
	/* … same markup, tone per badge, icon `Check` for phone, `BadgeCheck` for identity, `Building2` for business … */
}
```

The prop changes from `level: number` to `badge`, so a caller can never recompute the badge from a level it read somewhere: **update every call site in the same commit** (`shop-card.tsx`, `shop-hero.tsx`, `my-shop-entry.tsx`, the listing card, the listing detail seller card, the search results).

- [ ] **Step 9: Write the hooks**

Every hook wraps `useQuery`/`useMutation`; every mutation invalidates `verificationKey(shopId)` (queue mutations invalidate `moderationVerificationKeys.root` and `moderationVerificationKeys.summary`). The read hook keeps failure distinguishable from emptiness:

```ts
export function useShopVerification(shopId: string | null) {
	return useQuery({
		queryKey: verificationKey(shopId ?? ""),
		enabled: Boolean(shopId),
		queryFn: () => apiGet<ShopVerificationResponse>(`/api/shops/${shopId}/verification`),
		// No catch-and-return-null here. P1 shipped a hook that collapsed an API
		// error into a falsy value, and the screen then showed "nothing to
		// verify" for what was actually a failed request. Let the error surface;
		// the screen renders `isError` and `data === undefined` differently.
	});
}
```

- [ ] **Step 10: Verify and commit**

```bash
cd packages/web && bun test && bun run check-types
cd /home/yvan/Workspaces/Projects/bns/bns-repo && bunx biome check --write packages/web/src/lib/verification.ts packages/web/src/lib/verification.test.ts packages/web/src/lib/apiError.ts packages/web/src/lib/apiError.locales.test.ts packages/web/src/lib/query-keys.ts packages/web/src/hooks/use-verification.ts packages/web/src/hooks/use-moderation-verification.ts packages/web/src/components/shop/level-badge.tsx
git add packages/web/src/lib packages/web/src/hooks packages/web/src/components/shop/level-badge.tsx packages/web/messages/en.json packages/web/messages/fr.json
git commit -m "feat(web): add verification types, hooks, query keys and the identity and business badges"
```

---

### Task 21: `/seller/verification` — the hub

**Files:**
- Create: `packages/web/src/app/seller/verification/page.tsx`, `verification-client.tsx`
- Create: `packages/web/src/components/verification/level-ladder.tsx`, `request-timeline.tsx`, `verification-status-card.tsx`, `reviewer-message.tsx`
- Modify: `packages/web/src/components/seller/seller-shell.tsx` (sidebar entry)
- Test: `packages/web/src/lib/verification.test.ts` (extend with the timeline builder)

**Interfaces:**
- Consumes: `useShopVerification`, `levelLadder`, `canOpenRequest`, `statusToneKey`, `badgeLabelKey`, `LevelBadge`, `useMyShop`.
- Produces: `buildTimeline(request, t): TimelineEntry[]` in `lib/verification.ts`; the hub route.

- [ ] **Step 1: Write the failing timeline test**

Append to `packages/web/src/lib/verification.test.ts`:

```ts
import { buildTimeline } from "./verification";

describe("buildTimeline", () => {
	const request = {
		status: "needs_info",
		statusHistory: [
			{ status: "draft", at: "2026-10-01T09:00:00.000Z", source: "seller" },
			{ status: "submitted", at: "2026-10-01T10:00:00.000Z", source: "seller" },
			{ status: "in_review", at: "2026-10-02T10:00:00.000Z", source: "reviewer" },
			{ status: "needs_info", at: "2026-10-02T11:00:00.000Z", source: "reviewer" },
		],
		infoRequests: [{ reasonCode: "document_missing", message: "Send the NIU certificate.", requestedAt: "2026-10-02T11:00:00.000Z", respondedAt: null }],
		decision: null,
	};

	it("is newest first and marks the current step", () => {
		const timeline = buildTimeline(request as never);
		expect(timeline[0]).toMatchObject({ status: "needs_info", current: true });
		expect(timeline.at(-1)).toMatchObject({ status: "draft", current: false });
	});

	it("attaches the reviewer's message to the needs_info entry", () => {
		expect(buildTimeline(request as never)[0].message).toBe("Send the NIU certificate.");
	});

	it("attaches the decision message to a rejection", () => {
		const rejected = {
			status: "rejected",
			statusHistory: [{ status: "rejected", at: "2026-10-03T10:00:00.000Z", source: "reviewer" }],
			infoRequests: [],
			decision: { decidedAt: "2026-10-03T10:00:00.000Z", reasonCode: "document_expired", sellerMessage: "Your RCCM extract is from 2019." },
		};
		expect(buildTimeline(rejected as never)[0]).toMatchObject({
			status: "rejected", reasonCode: "document_expired", message: "Your RCCM extract is from 2019.",
		});
	});

	it("hides a vendor step from the seller's timeline", () => {
		const withVendor = { ...request, statusHistory: [...request.statusHistory, { status: "submitted", at: "2026-10-01T10:00:00.000Z", source: "vendor" }] };
		expect(buildTimeline(withVendor as never).some((e) => e.source === "vendor")).toBe(false);
	});

	it("is empty, not undefined, for a request with no history", () => {
		expect(buildTimeline({ status: "draft", statusHistory: [], infoRequests: [], decision: null } as never)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run to verify it fails, implement `buildTimeline`, run again**

Run: `cd packages/web && bun test src/lib/verification.test.ts` → FAIL, then PASS.

- [ ] **Step 3: Build the hub**

`page.tsx` is a Server Component that reads the shop through `getMyShop()` (the seller layout already redirects when there is none) and renders `<VerificationClient shopId={shop.id} />`.

`verification-client.tsx` (`"use client"`) uses `useShopVerification(shopId)` and renders, in order:

1. `VerificationStatusCard`: the current `LevelBadge`, the expiry date when `levelExpiresAt` is set, and a renewal call to action when `renewableFrom` for the current level has passed.
2. `LevelLadder`: three rungs from `levelLadder(capabilities)`, each naming what it unlocks from `CAPABILITY_UNLOCKS` via the `Verification.unlocks.*` messages.
3. Per open request: `RequestTimeline` from `buildTimeline`, plus `ReviewerMessage` on `needs_info` and `rejected`.
4. The primary action per level, driven by `canOpenRequest(view, level)` — the button is disabled **with a reason line** for every refusal (`disabled`, `notEligible`, `open`, `cooldown`, `notRenewableYet`), never a silently dead control.

Three explicit render states, because they mean different things:

```tsx
	if (query.isPending) return <VerificationSkeleton />;
	// An error is not an empty hub. P1 shipped a hook that collapsed a failure
	// into a falsy value and the screen said "nothing here".
	if (query.isError) return <VerificationError onRetry={() => query.refetch()} message={normalizeApiError(query.error).message} />;
	const view = query.data;
```

When `view.enabled === false`, the hub still renders the badge, the ladder and any in-flight request, with an information banner saying verification is not open yet and every action disabled. It does **not** render an empty page.

Keep each component under 200 lines; the ladder, the timeline, the status card and the reviewer message are four files for that reason.

- [ ] **Step 4: Add the sidebar entry**

In `seller-shell.tsx`, add a "Verification" item pointing at `/seller/verification`, shown whenever a shop exists (not gated on `verificationEnabled` — the hub is a read).

- [ ] **Step 5: Verify and commit**

```bash
cd packages/web && bun test && bun run check-types
cd /home/yvan/Workspaces/Projects/bns/bns-repo && bunx biome check --write packages/web/src/app/seller/verification packages/web/src/components/verification packages/web/src/components/seller/seller-shell.tsx packages/web/src/lib/verification.ts
git add packages/web/src/app/seller/verification packages/web/src/components/verification packages/web/src/components/seller/seller-shell.tsx packages/web/src/lib/verification.ts packages/web/src/lib/verification.test.ts
git commit -m "feat(web): add the seller verification hub"
```

---

### Task 22: `/seller/verification/identity` — consent and the vendor return

**Files:**
- Create: `packages/web/src/app/seller/verification/identity/page.tsx`, `identity-client.tsx`
- Create: `packages/web/src/app/seller/verification/identity/return/page.tsx`, `return-client.tsx`
- Create: `packages/web/src/components/verification/consent-notice.tsx`
- Modify: `packages/web/src/app/privacy/page.tsx` (or the existing privacy route) — the same section
- Test: `packages/web/src/lib/verification.test.ts` (extend with the polling policy)

**Interfaces:**
- Consumes: `useShopVerification`, `useOpenVerificationRequest`, `useStartKycSession`.
- Produces: `shouldKeepPolling(view, level, elapsedMs): boolean` and `POLL_INTERVAL_MS = 3000`, `POLL_TIMEOUT_MS = 120000` in `lib/verification.ts`.

- [ ] **Step 1: Write the failing polling test**

```ts
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS, shouldKeepPolling } from "./verification";

describe("shouldKeepPolling", () => {
	const pending = (status: string) => ({ requests: { level2: { status }, level3: null } }) as never;

	it("polls every 3 seconds for at most 2 minutes", () => {
		expect(POLL_INTERVAL_MS).toBe(3000);
		expect(POLL_TIMEOUT_MS).toBe(120_000);
	});

	it("keeps polling while the request is still with the vendor", () => {
		expect(shouldKeepPolling(pending("draft"), 2, 0)).toBe(true);
		expect(shouldKeepPolling(pending("submitted"), 2, 0)).toBe(true);
	});

	it("stops once the request has an answer", () => {
		for (const status of ["approved", "rejected", "needs_info", "in_review", "revoked", "expired"]) {
			expect(shouldKeepPolling(pending(status), 2, 0)).toBe(false);
		}
	});

	it("stops at the timeout even when nothing has changed", () => {
		expect(shouldKeepPolling(pending("draft"), 2, POLL_TIMEOUT_MS)).toBe(false);
	});

	it("stops when there is no request at all", () => {
		expect(shouldKeepPolling({ requests: { level2: null, level3: null } } as never, 2, 0)).toBe(false);
	});
});
```

- [ ] **Step 2: Implement and run**

Run: `cd packages/web && bun test src/lib/verification.test.ts` → FAIL, implement, → PASS.

- [ ] **Step 3: Build the consent screen**

`identity-client.tsx` renders `ConsentNotice` — bilingual copy naming what is collected (an identity document and a selfie, processed by the vendor), the vendor and its processing country, the retention periods, the rights of access and deletion, and the contact address — with a single checkbox and a Start button. The checkbox is a `react-hook-form` field with a zod schema (`z.object({ accepted: z.literal(true) })`), as `AGENTS.md` requires for every form.

Start does, in order: `useOpenVerificationRequest()` for level 2 (returning the existing draft if there is one), then `useStartKycSession()` with `{ consentVersion: view.consentVersion, locale }`, then `window.location.assign(url)` — same tab, as the spec says. A `verification.consentRequired` error means the notice was replaced while the page was open: refetch and re-render the new notice rather than retrying.

Add the same section to the web privacy page.

- [ ] **Step 4: Build the return page**

`return/page.tsx` reads `request` and `app` from `searchParams`. `return-client.tsx`:

```tsx
	// A mobile session opened this page in a system browser. Hand control back
	// to the app first; the app's own return screen then polls.
	useEffect(() => {
		if (app === "1") window.location.replace(`buynsellem://seller/verification/return?request=${requestId}`);
	}, [app, requestId]);
```

Polling uses TanStack Query's own `refetchInterval`, not a `setInterval` in an effect:

```tsx
	const startedAt = useRef(Date.now());
	const query = useQuery({
		queryKey: verificationKey(shopId),
		queryFn: () => apiGet<ShopVerificationResponse>(`/api/shops/${shopId}/verification`),
		refetchInterval: (query) =>
			query.state.data && shouldKeepPolling(query.state.data, 2, Date.now() - startedAt.current)
				? POLL_INTERVAL_MS
				: false,
	});
```

Three outcomes, each with its own copy and a link back to the hub: an answer arrived (`approved`, `needs_info`, `submitted` under review), the vendor declined and attempts remain (offer Retry), or the timeout elapsed (say the result may still arrive and offer Refresh).

- [ ] **Step 5: Verify and commit**

```bash
cd packages/web && bun test && bun run check-types
git add packages/web/src/app/seller/verification/identity packages/web/src/components/verification/consent-notice.tsx packages/web/src/lib/verification.ts packages/web/src/lib/verification.test.ts packages/web/src/app/privacy packages/web/messages/en.json packages/web/messages/fr.json
git commit -m "feat(web): add the identity verification consent screen and vendor return page"
```

---

### Task 23: `/seller/verification/business` — the form and the document slots

**Files:**
- Create: `packages/web/src/app/seller/verification/business/page.tsx`, `business-client.tsx`
- Create: `packages/web/src/components/verification/business-form.tsx`, `document-slot.tsx`, `document-slots.tsx`
- Create: `packages/web/src/lib/verification-business.ts`, `verification-business.test.ts`
- Test: as above

**Interfaces:**
- Consumes: `useShopVerification`, `useSaveBusiness`, `useUploadVerificationDocument`, `useDeleteVerificationDocument`, `useSubmitVerification`.
- Produces:
  - `businessSchema` (zod) and `BusinessFormValues = z.infer<typeof businessSchema>`
  - `requiredKinds(businessType, legalRepresentativeIsOwner): DocumentKind[]`
  - `missingKinds(values, documents): DocumentKind[]`
  - `canSubmit(values, documents): boolean`
  - `normalizeBusinessValues(values): BusinessFormValues`

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/lib/verification-business.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
	businessSchema, canSubmit, missingKinds, normalizeBusinessValues, requiredKinds,
} from "./verification-business";

const base = {
	businessType: "company" as const,
	legalName: "AKWA SARL",
	tradeName: "",
	rccmNumber: "RC/DLA/2020/B/1234",
	entreprenantDeclarationNumber: "",
	niu: "M012345678901X",
	registeredAddress: "Rue Njo-Njo, Bonapriso",
	city: "Douala",
	legalRepresentativeName: "Aïcha Mbappé",
	legalRepresentativeIsOwner: true,
};

describe("businessSchema", () => {
	it("accepts a complete company", () => {
		expect(businessSchema.safeParse(base).success).toBe(true);
	});

	it("requires an RCCM for a company and a declaration for an entreprenant", () => {
		expect(businessSchema.safeParse({ ...base, rccmNumber: "" }).success).toBe(false);
		expect(businessSchema.safeParse({
			...base, businessType: "entreprenant", rccmNumber: "", entreprenantDeclarationNumber: "DE/DLA/2021/1234",
		}).success).toBe(true);
	});

	it("requires a legal name of at least two characters and at most 120", () => {
		expect(businessSchema.safeParse({ ...base, legalName: "A" }).success).toBe(false);
		expect(businessSchema.safeParse({ ...base, legalName: "A".repeat(121) }).success).toBe(false);
	});

	it("requires exactly 14 alphanumeric characters for the NIU", () => {
		expect(businessSchema.safeParse({ ...base, niu: "M01234567890" }).success).toBe(false);
		expect(businessSchema.safeParse({ ...base, niu: "M012345678901!" }).success).toBe(false);
	});

	it("accepts a NIU of the right shape that does not match the usual pattern", () => {
		// The server turns that into a niu_format signal for a reviewer; it is
		// not the form's job to refuse a number a tax office actually issued.
		expect(businessSchema.safeParse({ ...base, niu: "ABCDEFGHIJKLMN" }).success).toBe(true);
	});
});

describe("normalizeBusinessValues", () => {
	it("uppercases and collapses the registration numbers", () => {
		expect(normalizeBusinessValues({ ...base, rccmNumber: "  rc/dla/2020/b/ 1234 ", niu: " m0123 45678901x " }))
			.toMatchObject({ rccmNumber: "RC/DLA/2020/B/ 1234", niu: "M012345678901X" });
	});

	it("leaves the human-typed fields alone", () => {
		expect(normalizeBusinessValues({ ...base, legalRepresentativeName: "  Aïcha Mbappé  " }).legalRepresentativeName)
			.toBe("Aïcha Mbappé");
	});
});

describe("document requirements", () => {
	it("asks for the right kinds per business type", () => {
		expect(requiredKinds("entreprenant", true)).toEqual(["entreprenant_declaration", "niu_certificate"]);
		expect(requiredKinds("company", true)).toEqual(["rccm_extract", "niu_certificate"]);
		expect(requiredKinds("company", false)).toEqual(["rccm_extract", "niu_certificate", "legal_representative_id", "mandate"]);
	});

	it("names what is still missing and gates submit on it", () => {
		expect(missingKinds(base, [{ kind: "rccm_extract" }])).toEqual(["niu_certificate"]);
		expect(canSubmit(base, [{ kind: "rccm_extract" }])).toBe(false);
		expect(canSubmit(base, [{ kind: "rccm_extract" }, { kind: "niu_certificate" }])).toBe(true);
	});

	it("does not let an invalid form submit even with every document present", () => {
		expect(canSubmit({ ...base, legalName: "" }, [{ kind: "rccm_extract" }, { kind: "niu_certificate" }])).toBe(false);
	});
});
```

- [ ] **Step 2: Run to verify it fails, implement `lib/verification-business.ts`, run again**

`requiredKinds` mirrors the server's `REQUIRED_DOCUMENTS` exactly. The two lists sitting in two packages is the one duplication this plan accepts, because the client needs it to disable a button and the server needs it to refuse a submit; the web test above and the API test in Task 12 assert the same table, so a divergence fails a test rather than shipping.

- [ ] **Step 3: Build the form**

`business-form.tsx`: `useForm<BusinessFormValues>({ resolver: zodResolver(businessSchema) })`, `businessType` as a Radix select driving which registration field is shown, `legalRepresentativeIsOwner` as a checkbox driving whether two more document slots appear. On submit, `useSaveBusiness()` (`PATCH …/business`); a `verification.fieldsInvalid` response maps back to fields with `setError`.

`document-slots.tsx` renders one `DocumentSlot` per kind from `requiredKinds`, plus an optional-extras slot. `document-slot.tsx` handles drag-and-drop and the file picker, shows an image preview or a PDF chip, and a Delete button. Client-side it refuses a type outside the four and a file over 10 MB before uploading, with the same two message keys the server would answer (`ApiErrors.upload.invalidType`, `upload.tooLarge`).

Page state uses `useReducer` with a partial-patch reducer, as `AGENTS.md` requires:

```tsx
type State = { step: "form" | "documents"; uploadingKind: DocumentKind | null; deletingId: string | null };
const initialState: State = { step: "form", uploadingKind: null, deletingId: null };
function reducer(state: State, patch: Partial<State>): State { return { ...state, ...patch }; }
const [state, patch] = useReducer(reducer, initialState);
```

Deleting a document asks for confirmation — it destroys an upload the seller may not have another copy of — and the confirmation is a single inline "Delete / Cancel" pair, not a typed-name dialog. P1 shipped both mistakes in one release: a destructive action with no confirmation, and one whose confirmation was heavier than the act deserved.

The Submit button is enabled exactly when `canSubmit(values, documents)`, and when it is disabled a line names the missing kinds.

- [ ] **Step 4: Verify and commit**

```bash
cd packages/web && bun test && bun run check-types
git add packages/web/src/app/seller/verification/business packages/web/src/components/verification packages/web/src/lib/verification-business.ts packages/web/src/lib/verification-business.test.ts packages/web/messages/en.json packages/web/messages/fr.json
git commit -m "feat(web): add the business verification form and document slots"
```

---

### Task 24: `/moderation/verification` — the reviewer queue

**Files:**
- Create: `packages/web/src/app/moderation/layout.tsx`, `verification/page.tsx`, `verification/queue-client.tsx`
- Create: `packages/web/src/components/moderation/queue-tabs.tsx`, `queue-row.tsx`, `signal-chip.tsx`, `age-chip.tsx`
- Create: `packages/web/src/lib/moderation-verification.ts`, `moderation-verification.test.ts`

**Interfaces:**
- Consumes: `useVerificationQueue`, `useAuth`, `moderationVerificationKeys`.
- Produces: `queueTabs(summary)`, `signalToneKey(code)`, `relativeAge(iso, now)`, `isModerator(user)` reuse.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/lib/moderation-verification.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { queueTabs, relativeAge, signalToneKey } from "./moderation-verification";

describe("signalToneKey", () => {
	it("separates the signals that mean fraud from the ones that mean paperwork", () => {
		for (const code of ["identity_reused", "document_reused", "kyc_declined", "underage"]) {
			expect(signalToneKey(code as never)).toBe("negative");
		}
		for (const code of ["name_mismatch", "kyc_review", "rccm_reused", "niu_reused"]) {
			expect(signalToneKey(code as never)).toBe("warning");
		}
		expect(signalToneKey("niu_format")).toBe("neutral");
	});
});

describe("relativeAge", () => {
	const now = new Date("2026-10-02T12:00:00.000Z");
	it("counts minutes, then hours, then days", () => {
		expect(relativeAge("2026-10-02T11:30:00.000Z", now)).toEqual({ unit: "minutes", count: 30 });
		expect(relativeAge("2026-10-02T04:00:00.000Z", now)).toEqual({ unit: "hours", count: 8 });
		expect(relativeAge("2026-09-28T12:00:00.000Z", now)).toEqual({ unit: "days", count: 4 });
	});

	it("never reports a negative age for a clock skew", () => {
		expect(relativeAge("2026-10-02T12:05:00.000Z", now)).toEqual({ unit: "minutes", count: 0 });
	});

	it("reports nothing for a request that was never submitted", () => {
		expect(relativeAge(null, now)).toBeNull();
	});
});

describe("queueTabs", () => {
	it("shows a count only on the queue that has one", () => {
		expect(queueTabs({ pendingVerifications: 4 })).toEqual([
			{ key: "to_review", count: 4 },
			{ key: "mine", count: null },
			{ key: "needs_info", count: null },
			{ key: "decided", count: null },
		]);
	});

	it("shows no count rather than zero when the summary has not loaded", () => {
		expect(queueTabs(undefined)[0].count).toBeNull();
	});
});
```

- [ ] **Step 2: Implement and run**

Run: `cd packages/web && bun test src/lib/moderation-verification.test.ts` → FAIL, implement, → PASS.

- [ ] **Step 3: Build the screens**

`app/moderation/layout.tsx` is a Server Component that reads the session and calls `notFound()` for anyone below moderator — a not-found page, not a 403, so the existence of the moderation surface is not advertised.

`queue-client.tsx` renders `QueueTabs` (To review / Mine / Waiting on seller / Decided), level and signal filters, and the rows. Each row shows the shop handle and name, the owner name, the requested level, `AgeChip`, and one `SignalChip` per signal. Empty, loading and error states are three distinct renders; the error state offers Retry and shows the normalised message.

The queue is not gated on `verificationEnabled` — a reviewer finishes in-flight work whatever the flag says.

- [ ] **Step 4: Verify and commit**

```bash
cd packages/web && bun test && bun run check-types
git add packages/web/src/app/moderation packages/web/src/components/moderation packages/web/src/lib/moderation-verification.ts packages/web/src/lib/moderation-verification.test.ts packages/web/messages/en.json packages/web/messages/fr.json
git commit -m "feat(web): add the reviewer verification queue, the first browser moderation screen"
```

---

### Task 25: `/moderation/verification/[id]` — the review page

**Files:**
- Create: `packages/web/src/app/moderation/verification/[id]/page.tsx`, `review-client.tsx`
- Create: `packages/web/src/components/moderation/kyc-summary.tsx`, `business-summary.tsx`, `signals-panel.tsx`, `checklist.tsx`, `document-viewer.tsx`, `decision-bar.tsx`, `decision-dialog.tsx`
- Modify: `packages/web/next.config.ts` (CSP `img-src` / `frame-src`, only if a CSP is set)
- Create: `packages/web/src/lib/verification-decision.ts`, `verification-decision.test.ts`

**Interfaces:**
- Consumes: `useVerificationRequest`, `useVerificationDecision`, `useDocumentUrl`.
- Produces:
  - `decisionSchema(action)` (zod, per action), `DecisionValues`
  - `checklistComplete(checklist): boolean`, `CHECKLIST_ITEMS`
  - `availableActions(viewer, status): DecisionAction[]`
  - `documentUrlIsStale(expiresAt, now): boolean`

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/lib/verification-decision.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
	availableActions, CHECKLIST_ITEMS, checklistComplete, decisionSchema, documentUrlIsStale,
} from "./verification-decision";

const viewer = (over = {}) => ({
	canClaim: false, canDecide: false, isAssignee: false, isAdmin: false, conflictOfInterest: false, ...over,
});

describe("availableActions", () => {
	it("reads the permission the API states, never a value being present", () => {
		// P1 shipped a client that inferred a permission from whether a field was
		// there. The viewer block is the authority; `assignee` is only display.
		expect(availableActions(viewer({ canClaim: true }), "submitted")).toEqual(["claim"]);
		expect(availableActions(viewer({ canDecide: true, isAssignee: true }), "in_review"))
			.toEqual(["release", "request_info", "approve", "reject"]);
	});

	it("offers nothing to a reviewer with a conflict of interest", () => {
		expect(availableActions(viewer({ canClaim: true, conflictOfInterest: true }), "submitted")).toEqual([]);
	});

	it("offers revoke on an approved request to anyone who may decide", () => {
		expect(availableActions(viewer({ canDecide: true }), "approved")).toEqual(["revoke"]);
	});

	it("offers nothing on a terminal request", () => {
		for (const status of ["rejected", "revoked", "expired"]) {
			expect(availableActions(viewer({ canDecide: true, isAdmin: true }), status as never)).toEqual([]);
		}
	});
});

describe("decisionSchema", () => {
	it("requires a reason and a seller message to reject or request info", () => {
		expect(decisionSchema("reject").safeParse({ reasonCode: "", sellerMessage: "" }).success).toBe(false);
		expect(decisionSchema("reject").safeParse({ reasonCode: "document_expired", sellerMessage: "Expired." }).success).toBe(true);
		expect(decisionSchema("request_info").safeParse({ reasonCode: "document_missing", sellerMessage: "" }).success).toBe(false);
	});

	it("requires only a reason to revoke", () => {
		expect(decisionSchema("revoke").safeParse({ reasonCode: "fraud" }).success).toBe(true);
		expect(decisionSchema("revoke").safeParse({ reasonCode: "" }).success).toBe(false);
	});

	it("requires nothing to claim or release", () => {
		expect(decisionSchema("claim").safeParse({}).success).toBe(true);
		expect(decisionSchema("release").safeParse({}).success).toBe(true);
	});
});

describe("checklistComplete", () => {
	it("names the five items", () => {
		expect(CHECKLIST_ITEMS).toEqual([
			"name_matches_registry",
			"registration_number_matches_document",
			"niu_matches_certificate",
			"representative_matches_identity_or_mandate",
			"documents_legible_and_current",
		]);
	});

	it("is complete only when every item is true", () => {
		const all = Object.fromEntries(CHECKLIST_ITEMS.map((k) => [k, true]));
		expect(checklistComplete(all)).toBe(true);
		expect(checklistComplete({ ...all, niu_matches_certificate: false })).toBe(false);
		expect(checklistComplete({})).toBe(false);
	});
});

describe("documentUrlIsStale", () => {
	it("is stale at and past the expiry, and a few seconds before it", () => {
		const now = new Date("2026-10-02T12:00:00.000Z");
		expect(documentUrlIsStale("2026-10-02T12:00:00.000Z", now)).toBe(true);
		expect(documentUrlIsStale("2026-10-02T12:00:03.000Z", now)).toBe(true);
		expect(documentUrlIsStale("2026-10-02T12:00:30.000Z", now)).toBe(false);
	});
});
```

- [ ] **Step 2: Implement and run**

Run: `cd packages/web && bun test src/lib/verification-decision.test.ts` → FAIL, implement, → PASS.

- [ ] **Step 3: Build the review page**

Two columns plus a sticky action bar, each panel its own file to stay under 200 lines.

Left column: shop and owner card; `KycSummary` (outcome, document type and country, last 4, document expiry, the names as read, liveness, face-match score, a link to the vendor console); `BusinessSummary` with a format warning beside a NIU that carries the `niu_format` signal; `SignalsPanel` with a link to each related request; `Checklist` (level 3 only) as five switches.

Right column: `DocumentViewer`. It requests a signed URL on open, renders an image in `<img>` and a PDF in `<iframe>`, and re-requests when `documentUrlIsStale(expiresAt)` — every re-request writes another view row, which is the intent. It never caches a URL across documents.

Sticky bar: the actions from `availableActions(detail.viewer, detail.request.status)`, each opening `DecisionDialog` with the fields `decisionSchema(action)` requires. Approve and Reject both confirm, because both are consequential and neither is reversible by the reviewer; Claim and Release do not, because either is undone by the other in one click.

On success every mutation invalidates `moderationVerificationKeys.detail(id)`, `moderationVerificationKeys.root` and `moderationVerificationKeys.summary`.

- [ ] **Step 4: CSP**

If `packages/web/next.config.ts` sets a Content-Security-Policy, add the private bucket origin to `img-src` and `frame-src` from an env var (`NEXT_PUBLIC_PRIVATE_MEDIA_ORIGIN`), declared in the three compose files. If no CSP is set, note that in a one-line comment and change nothing.

- [ ] **Step 5: Verify and commit**

```bash
cd packages/web && bun test && bun run check-types
git add packages/web/src/app/moderation/verification packages/web/src/components/moderation packages/web/src/lib/verification-decision.ts packages/web/src/lib/verification-decision.test.ts packages/web/next.config.ts packages/web/messages/en.json packages/web/messages/fr.json
git commit -m "feat(web): add the verification review page with a logged document viewer"
```

---

### Task 26: Badges, the legal block, the profile banners and the search filter

**Files:**
- Modify: `packages/web/src/app/s/[handle]/page.tsx` and its components; `packages/web/src/app/shop/manage/*`; `packages/web/src/app/profile/me/page.tsx`, `profile/[userId]/page.tsx`; `packages/web/src/components/listing/*`; the search filter components
- Create: `packages/web/src/components/shop/legal-block.tsx`
- Create: `packages/web/src/lib/shop-legal.ts`, `shop-legal.test.ts`

**Interfaces:**
- Consumes: `LevelBadge` (Task 20), `PublicShop.badge`, `ShopLegal`.
- Produces: `legalBlockLines(legal): { label: string; value: string }[]`, `legalIsVerified(legal): boolean`, `legalFormSchema` for `/shop/manage`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import { legalBlockLines, legalIsVerified } from "./shop-legal";

describe("legalBlockLines", () => {
	it("shows only the fields the shop actually declared", () => {
		expect(legalBlockLines({ businessType: "company", legalName: "AKWA SARL", rccmNumber: "RC/DLA/2020/B/1234", niu: null, verifiedAt: null }))
			.toEqual([
				{ label: "legalName", value: "AKWA SARL" },
				{ label: "businessType", value: "company" },
				{ label: "rccm", value: "RC/DLA/2020/B/1234" },
			]);
	});

	it("is empty for a shop that declared nothing, so the block is not rendered", () => {
		expect(legalBlockLines(null)).toEqual([]);
		expect(legalBlockLines({ businessType: null, legalName: null, rccmNumber: null, niu: null, verifiedAt: null })).toEqual([]);
	});
});

describe("legalIsVerified", () => {
	it("is true only once a reviewer has approved it", () => {
		expect(legalIsVerified({ legalName: "X", verifiedAt: "2026-10-01T00:00:00.000Z" } as never)).toBe(true);
		expect(legalIsVerified({ legalName: "X", verifiedAt: null } as never)).toBe(false);
		expect(legalIsVerified(null)).toBe(false);
	});
});
```

- [ ] **Step 2: Implement, then make the six changes**

1. `/s/[handle]`: `LevelBadge badge={shop.badge}`; render `LegalBlock` when `legalBlockLines(shop.legal).length > 0`, headed "Verified" when `legalIsVerified(shop.legal)` and "Declared by the shop" otherwise. The two labels are different message keys, never the same string with a tick.
2. `/shop/manage`: a legal section (`react-hook-form` + `legalFormSchema`) editable while `capabilities.effectiveLevel < 3` and read-only at 3, with a line saying a change needs a new business verification.
3. `profile/me`: delete the "verify your account" banner and the "Verified Seller" banner. An owner sees their shop's `LevelBadge` and a link "Increase your level" to `/seller/verification`; a visitor with no shop sees nothing.
4. `profile/[userId]`: the badge of the shop that user owns, if any; otherwise nothing. Never `user.verified`.
5. Listing cards and listing detail seller card: `LevelBadge badge={listing.shop?.badge}`.
6. Search: a "Verified shops only" checkbox setting `minShopLevel=2`, in both the listings and the shops tab, with the label under `Search.verifiedShopsOnly`.

- [ ] **Step 3: Prove `user.verified` is gone from web**

```bash
cd packages/web && grep -rn "\.verified" src/ --include="*.tsx" --include="*.ts" | grep -v "phoneVerified\|identityVerifiedAt\|legalIsVerified\|verifiedAt"
```

Expected: no output.

- [ ] **Step 4: Verify and commit**

```bash
cd packages/web && bun test && bun run check-types
git add packages/web/src packages/web/messages
git commit -m "feat(web): show shop badges and the legal block, and retire the personal verified badge"
```

---

## Mobile (Tasks 27–33)

### Task 27: Mobile foundations — types, error codes, keys, badge levels, document picker

**Files:**
- Modify: `packages/mobile/src/types/api.ts`, `src/lib/apiError.ts`, `src/locales/en.json`, `fr.json`, `package.json`
- Create: `packages/mobile/src/lib/verification.ts`, `verification.test.ts`
- Create: `packages/mobile/src/hooks/useVerification.ts`, `useModerationVerification.ts`
- Modify: `packages/mobile/src/components/shop/LevelBadge.tsx`

**Interfaces:**
- Consumes: the API contracts block; `moderationKeys` (`src/hooks/useModeration.ts`).
- Produces: the same type mirrors and pure helpers as web (`badgeLabelKey`, `levelLadder`, `canOpenRequest`, `statusToneKey`, `buildTimeline`, `shouldKeepPolling`, `requiredKinds`, `missingKinds`, `canSubmit`, `availableActions`, `checklistComplete`); `verificationKeys` under the existing shop scope; the hooks; `LevelBadge` taking `badge`.

- [ ] **Step 1: Add the fifteen codes and keep the drift test green**

Add the fifteen `verification*` entries to `ERROR_CODES` and `FALLBACKS` in `packages/mobile/src/lib/apiError.ts`, and a `verification` block under `apiErrors` in **both** `src/locales/en.json` and `src/locales/fr.json` with the same fifteen leaves.

Run: `cd packages/mobile && bun test src/lib/apiError.locales.test.ts`
Expected: PASS. If it fails on "the two locale files expose the same apiErrors keys", one locale is missing a leaf — that is the drift the test exists to catch.

- [ ] **Step 2: Add the document picker**

```bash
cd packages/mobile && bunx expo install expo-document-picker
```

Expected: the SDK 57-compatible version lands in `package.json`.

- [ ] **Step 3: Write the failing shared-logic test**

Create `packages/mobile/src/lib/verification.test.ts` with the same cases as `packages/web/src/lib/verification.test.ts` (Tasks 20–23) — `badgeLabelKey`, `levelLadder`, `canOpenRequest` including the renewal window, `statusToneKey`, `buildTimeline`, `shouldKeepPolling`, `requiredKinds`, `missingKinds`, `canSubmit`, `availableActions`, `checklistComplete`. Two copies is what the repository's package boundary forces; the two test files assert the same table, so a divergence fails rather than ships.

- [ ] **Step 4: Run to verify it fails, implement `src/lib/verification.ts`, run again**

Run: `cd packages/mobile && bun test src/lib/verification.test.ts` → FAIL, implement, → PASS.

- [ ] **Step 5: Extend `LevelBadge`**

Change the prop from `level: number` to `badge: "phone" | "identity" | "business" | null`, render `shop.levelPhone` / `levelIdentity` / `levelBusiness` with a distinct icon and tone each, and update every call site in the same commit (`ShopCard`, `ShopHeader`, `ShopSellerCard`, `ListingCard`, `listing/[id].tsx`, `s/[handle].tsx`, `profile/[userId].tsx`, `(tabs)/account/index.tsx`).

- [ ] **Step 6: Mark `UserDoc.verified` deprecated**

```ts
	/**
	 * @deprecated Retired in P2: badges belong to shops. The API still returns
	 * it, derived from the owner's identity verification, only so released app
	 * versions keep working. Read the shop's `badge` instead.
	 */
	verified: boolean;
```

Nothing in the app reads it after Task 32.

- [ ] **Step 7: Write the hooks**

`useVerification.ts` and `useModerationVerification.ts` mirror the web hooks, with keys nested under the existing shop scope and the moderation root:

```ts
export const verificationKeys = {
	shop: (shopId: string) => ["shops", shopId, "verification"] as const,
	request: (shopId: string, requestId: string) => ["shops", shopId, "verification", requestId] as const,
};

/** Nested under `moderationKeys` so the hub's existing invalidations reach it. */
export const moderationVerificationKeys = {
	root: ["moderation", "verification"] as const,
	queue: (queue: string) => ["moderation", "verification", "queue", queue] as const,
	detail: (id: string) => ["moderation", "verification", "detail", id] as const,
};
```

The read hook does not swallow errors, for the same reason as web.

- [ ] **Step 8: Verify and commit**

```bash
cd packages/mobile && bun test && bunx tsc --noEmit
cd /home/yvan/Workspaces/Projects/bns/bns-repo && bunx biome check --write packages/mobile/src/lib/verification.ts packages/mobile/src/lib/verification.test.ts packages/mobile/src/lib/apiError.ts packages/mobile/src/hooks/useVerification.ts packages/mobile/src/hooks/useModerationVerification.ts packages/mobile/src/components/shop/LevelBadge.tsx
git add packages/mobile/src packages/mobile/package.json bun.lock
git commit -m "feat(mobile): add verification types, hooks, error codes and the identity and business badges"
```

---

### Task 28: Mobile seller verification hub

**Files:**
- Create: `packages/mobile/app/seller/verification/index.tsx`
- Create: `packages/mobile/src/components/verification/LevelLadder.tsx`, `RequestTimeline.tsx`, `VerificationStatusCard.tsx`, `ReviewerMessage.tsx`
- Modify: `packages/mobile/app/_layout.tsx` (route registration), `packages/mobile/app/seller/index.tsx` (tile), `packages/mobile/src/locales/en.json`, `fr.json`

**Interfaces:**
- Consumes: `useShopVerification`, `levelLadder`, `canOpenRequest`, `buildTimeline`, `LevelBadge`, `useShops`.
- Produces: the `seller/verification` route; a "Verification" tile on the shop hub showing the badge and any pending state.

- [ ] **Step 1: Register the routes**

In `packages/mobile/app/_layout.tsx`, add four `Stack.Screen` entries with `headerShown: false`: `seller/verification/index`, `seller/verification/identity`, `seller/verification/return`, `seller/verification/business`, plus `moderation/verification/[id]`.

- [ ] **Step 2: Build the hub**

`app/seller/verification/index.tsx` mirrors the web hub: status card with `LevelBadge` and expiry, three-rung ladder, timeline per open request, reviewer message on `needs_info` and `rejected`, one primary action per level driven by `canOpenRequest`, each refusal with a reason line.

Three render states, distinct: loading skeleton, error with Retry and the normalised message, data. `enabled === false` renders the whole hub with an information banner and disabled actions — never an empty screen.

Screen state uses `useReducer` with a partial-patch reducer. Every pressable carries `accessibilityLabel` and a 44px minimum touch target.

- [ ] **Step 3: Add the shop-hub tile**

In `app/seller/index.tsx`, add a "Verification" tile showing the current badge and, when a request is open, its status; it navigates to `/seller/verification`.

- [ ] **Step 4: Verify and commit**

```bash
cd packages/mobile && bun test && bunx tsc --noEmit
git add packages/mobile/app packages/mobile/src/components/verification packages/mobile/src/locales
git commit -m "feat(mobile): add the seller verification hub and shop-hub tile"
```

---

### Task 29: Mobile identity flow and the return deep link

**Files:**
- Create: `packages/mobile/app/seller/verification/identity.tsx`, `return.tsx`
- Create: `packages/mobile/src/components/verification/ConsentNotice.tsx`
- Modify: `packages/mobile/app/account/privacy.tsx` (or the existing privacy screen), `app.json` (scheme already present — verify only), locales

**Interfaces:**
- Consumes: `useOpenVerificationRequest`, `useStartKycSession`, `shouldKeepPolling`, `expo-web-browser`.
- Produces: the two routes; the `buynsellem://seller/verification/return` deep link resolving through expo-router.

- [ ] **Step 1: Build the consent screen**

Same bilingual notice as web, in `ConsentNotice`, with a `react-hook-form` + zod checkbox (`z.object({ accepted: z.literal(true) })`). Start opens the vendor session:

```tsx
	const result = await WebBrowser.openAuthSessionAsync(
		session.url,
		"buynsellem://seller/verification/return",
	);
```

with `returnUrl` on the server side pointing at the web return page with `app=1`, so the vendor's own redirect lands on a page that hands control back to the app.

- [ ] **Step 2: Build the return screen**

Polls with the same TanStack Query `refetchInterval` policy as web, driven by `shouldKeepPolling`. It also refetches when the app returns to the foreground:

```tsx
	// The auth session can close without ever firing the redirect — the user
	// taps Done, or the system browser is dismissed. Coming back to the
	// foreground is the only signal we get in that case.
	useEffect(() => {
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") query.refetch();
		});
		return () => subscription.remove();
	}, [query]);
```

That is a genuine subscription to something outside React, which is what `useEffect` is for; the data itself still comes from the query.

Same three outcomes as web: an answer, a decline with attempts left (Retry), or the timeout (Refresh).

- [ ] **Step 3: Add the privacy section and verify the scheme**

Add the same data-protection section to the mobile privacy screen. Confirm `app.json` already declares the `buynsellem` scheme (P1 uses `buynsellem://` deep links); if it does, change nothing.

- [ ] **Step 4: Verify and commit**

```bash
cd packages/mobile && bun test && bunx tsc --noEmit
git add packages/mobile/app packages/mobile/src packages/mobile/src/locales
git commit -m "feat(mobile): add the identity verification consent flow and vendor return screen"
```

---

### Task 30: Mobile business form and document slots

**Files:**
- Create: `packages/mobile/app/seller/verification/business.tsx`
- Create: `packages/mobile/src/components/verification/BusinessForm.tsx`, `DocumentSlot.tsx`, `DocumentSlots.tsx`
- Create: `packages/mobile/src/lib/verificationBusiness.ts`, `verificationBusiness.test.ts`
- Modify: `packages/mobile/src/lib/pickAndUpload.ts`, locales

**Interfaces:**
- Consumes: `expo-image-picker` (camera and library), `expo-document-picker` (PDFs), `useSaveBusiness`, `useUploadVerificationDocument`, `useDeleteVerificationDocument`, `useSubmitVerification`.
- Produces: `businessSchema`, `normalizeBusinessValues`, `requiredKinds`, `missingKinds`, `canSubmit` — the same table as `packages/web/src/lib/verification-business.ts`; `pickVerificationDocument(kind): Promise<PickedFile | null>`.

- [ ] **Step 1: Write the failing test**

Create `packages/mobile/src/lib/verificationBusiness.test.ts` with the same cases as `packages/web/src/lib/verification-business.test.ts`, plus:

```ts
describe("pickVerificationDocument result shape", () => {
	it("refuses a type outside the four before any upload", () => {
		expect(isAcceptedDocument({ mimeType: "image/gif", size: 10 })).toEqual({ ok: false, code: "upload.invalidType" });
		expect(isAcceptedDocument({ mimeType: "application/pdf", size: 10 })).toEqual({ ok: true });
	});

	it("refuses a file over 10 MB before any upload", () => {
		expect(isAcceptedDocument({ mimeType: "application/pdf", size: 10 * 1024 * 1024 + 1 }))
			.toEqual({ ok: false, code: "upload.tooLarge" });
		expect(isAcceptedDocument({ mimeType: "application/pdf", size: 10 * 1024 * 1024 })).toEqual({ ok: true });
	});

	it("refuses a picker result with no size rather than uploading blind", () => {
		expect(isAcceptedDocument({ mimeType: "application/pdf", size: null }))
			.toEqual({ ok: false, code: "upload.invalidType" });
	});
});
```

- [ ] **Step 2: Run to verify it fails, implement, run again**

Run: `cd packages/mobile && bun test src/lib/verificationBusiness.test.ts` → FAIL, implement, → PASS.

- [ ] **Step 3: Build the form**

`BusinessForm` uses `react-hook-form` + `zodResolver(businessSchema)`, with `businessType` as a segmented control and `legalRepresentativeIsOwner` as a switch that adds two document slots.

`DocumentSlot` offers three sources in an action sheet: Camera, Photo library (`expo-image-picker`), and Document (`expo-document-picker`, `type: ["application/pdf"]`). It shows an image thumbnail with `expo-image` or a PDF chip, and a Delete action. Delete confirms once with a `CustomAlert` "Delete / Cancel" pair — no typed confirmation.

Screen state is one `useReducer` with a partial-patch reducer. Submit is enabled exactly when `canSubmit(values, documents)`; disabled, it shows the missing kinds.

- [ ] **Step 4: Verify and commit**

```bash
cd packages/mobile && bun test && bunx tsc --noEmit
git add packages/mobile/app/seller/verification/business.tsx packages/mobile/src/components/verification packages/mobile/src/lib/verificationBusiness.ts packages/mobile/src/lib/verificationBusiness.test.ts packages/mobile/src/lib/pickAndUpload.ts packages/mobile/src/locales
git commit -m "feat(mobile): add the business verification form with camera, library and PDF slots"
```

---

### Task 31: Mobile moderation — the verification queue and review sheet

**Files:**
- Modify: `packages/mobile/app/moderation/index.tsx`
- Create: `packages/mobile/app/moderation/verification/[id].tsx`
- Create: `packages/mobile/src/components/moderation/VerificationCard.tsx`, `KycSummaryCard.tsx`, `BusinessSummaryCard.tsx`, `SignalsPanel.tsx`, `ChecklistSwitches.tsx`, `DocumentList.tsx`
- Create: `packages/mobile/src/lib/moderationVerification.ts`, `moderationVerification.test.ts`
- Modify: locales

**Interfaces:**
- Consumes: `ModerationScreen`, `DecisionSheet` (P1), `useModerationSummary`, `useVerificationQueue`, `useVerificationRequest`, `useVerificationDecision`, `useDocumentUrl`.
- Produces: `QueueKey` gains `"verification"`; `signalToneKey`, `relativeAge`, `availableActions` reused from `src/lib/verification.ts`.

- [ ] **Step 1: Write the failing test**

Create `packages/mobile/src/lib/moderationVerification.test.ts` with the same `signalToneKey` / `relativeAge` cases as web, plus the tab-count rule:

```ts
describe("queue tabs", () => {
	it("adds a verification tab fed by pendingVerifications", () => {
		expect(queueTabs({ pendingListings: 2, pendingReports: 1, pendingVerifications: 4 }).map((t) => t.key))
			.toEqual(["listings", "reports", "verification"]);
		expect(queueTabs({ pendingListings: 2, pendingReports: 1, pendingVerifications: 4 }).at(-1)?.count).toBe(4);
	});

	it("shows no count rather than zero before the summary loads", () => {
		expect(queueTabs(undefined).at(-1)?.count).toBeNull();
	});
});
```

- [ ] **Step 2: Implement, then extend the hub**

In `app/moderation/index.tsx`: `type QueueKey = "listings" | "reports" | "verification";`, a third `useVerificationQueue("to_review")` infinite query, a third tab whose count comes from `summary.data?.pendingVerifications`, and a `VerificationCard` row renderer. Tapping a row pushes `/moderation/verification/${id}`.

- [ ] **Step 3: Build the review sheet**

`app/moderation/verification/[id].tsx` on `ModerationScreen` + `DecisionSheet`:

- `KycSummaryCard`, `BusinessSummaryCard`, `SignalsPanel`, `ChecklistSwitches` (level 3), `DocumentList`.
- `DocumentList` requests a signed URL per document on tap. Images render with `expo-image` and `cachePolicy="none"` — a cached identity document on a reviewer's device would outlive the 60-second URL and every retention rule. PDFs open with `WebBrowser.openBrowserAsync(url)`.
- Actions come from `availableActions(detail.viewer, status)` — the API's `viewer` block, never inferred from whether `assignee` happens to be set.
- `DecisionSheet` collects the reason and the seller message per `decisionSchema(action)`. Approve and Reject confirm; Claim and Release do not.

- [ ] **Step 4: Verify and commit**

```bash
cd packages/mobile && bun test && bunx tsc --noEmit
git add packages/mobile/app/moderation packages/mobile/src/components/moderation packages/mobile/src/lib/moderationVerification.ts packages/mobile/src/lib/moderationVerification.test.ts packages/mobile/src/locales
git commit -m "feat(mobile): add the verification queue and review sheet to the moderation hub"
```

---

### Task 32: Mobile badges, the legal block, the banners and the filter

**Files:**
- Modify: `packages/mobile/app/s/[handle].tsx`, `app/listing/[id].tsx`, `app/profile/[userId].tsx`, `app/(tabs)/account/index.tsx`, `app/account/edit-profile.tsx`, `app/shop/manage.tsx`, the search filter components
- Create: `packages/mobile/src/components/shop/LegalBlock.tsx`
- Create: `packages/mobile/src/lib/shopLegal.ts`, `shopLegal.test.ts`
- Modify: locales

**Interfaces:**
- Consumes: `LevelBadge`, `PublicShop.badge`, `ShopLegal`.
- Produces: `legalBlockLines`, `legalIsVerified` — the same table as web.

- [ ] **Step 1: Write the failing test**

Create `packages/mobile/src/lib/shopLegal.test.ts` with the same cases as `packages/web/src/lib/shop-legal.test.ts`.

- [ ] **Step 2: Implement, then make the six changes**

1. `s/[handle].tsx`: `LevelBadge badge={shop.badge}` and `LegalBlock`, headed "Verified" or "Declared by the shop" from `legalIsVerified`.
2. `listing/[id].tsx`: the seller card badge comes from the listing's shop, replacing `seller.verified`.
3. `profile/[userId].tsx`: the badge of the shop that user owns, if any; the `profile.verifiedBadge` string is retired.
4. `(tabs)/account/index.tsx`: for an owner, the shop's badge; for anyone else, nothing.
5. `account/edit-profile.tsx`: both banners removed; an owner sees the badge plus "Increase your level" to `/seller/verification`; a visitor with no shop sees nothing.
6. Filters: a "Verified shops only" toggle wired to `minShopLevel=2`, reusing the existing, so-far-unused `filters.verified` key ("Vendeurs vérifiés uniquement" / "Verified sellers only").
7. `shop/manage.tsx`: the legal section, editable below level 3 and read-only at 3.

- [ ] **Step 3: Prove `user.verified` is gone from mobile**

```bash
cd packages/mobile && grep -rn "\.verified" app/ src/ --include="*.tsx" --include="*.ts" | grep -v "phoneVerified\|identityVerifiedAt\|legalIsVerified\|verifiedAt\|@deprecated"
```

Expected: no output outside `src/types/api.ts`'s deprecated declaration.

- [ ] **Step 4: Verify and commit**

```bash
cd packages/mobile && bun test && bunx tsc --noEmit
git add packages/mobile/app packages/mobile/src
git commit -m "feat(mobile): show shop badges and the legal block, and retire the personal verified badge"
```

---

### Task 33: Cross-client checkpoint

**Files:** none new — this task is a gate.

- [ ] **Step 1: Run every check**

```bash
cd packages/api && bun run generate:types && bun run check-types && bunx vitest run --config ./vitest.config.mts
cd packages/web && bun test && bun run check-types
cd packages/mobile && bun test && bunx tsc --noEmit
cd packages/search-indexer && bun run check-types
cd /home/yvan/Workspaces/Projects/bns/bns-repo && bunx biome check packages/api/src packages/web/src packages/mobile/src packages/mobile/app
```

Expected: the same five pre-existing API failures and nothing else; Biome clean.

- [ ] **Step 2: Prove the two error-code catalogues agree with the API**

```bash
cd /home/yvan/Workspaces/Projects/bns/bns-repo
node -e '
const api = require("fs").readFileSync("packages/api/src/lib/errors.ts","utf8").match(/"verification\.[a-zA-Z]+"/g).sort();
const web = require("fs").readFileSync("packages/web/src/lib/apiError.ts","utf8").match(/"verification\.[a-zA-Z]+"/g).sort();
const mob = require("fs").readFileSync("packages/mobile/src/lib/apiError.ts","utf8").match(/"verification\.[a-zA-Z]+"/g).sort();
if (JSON.stringify(api)!==JSON.stringify(web) || JSON.stringify(api)!==JSON.stringify(mob)) { console.error("codes diverge", {api,web,mob}); process.exit(1); }
console.log("15 codes, three catalogues, in agreement");
'
```

Expected: the agreement line. (This is a one-off check; do not commit the script — `/tmp` or `node -e` only.)

- [ ] **Step 3: Prove the i18n files are in sync**

```bash
cd packages/web && bun test src/lib/apiError.locales.test.ts
cd packages/mobile && bun test src/lib/apiError.locales.test.ts
```

Expected: PASS on both.

- [ ] **Step 4: Commit any fixes**

```bash
git add <the files you touched>
git commit -m "chore: cross-client verification checkpoint"
```

---

## Release

### Task 34: Staging pass with the flag off, then on, then production

**Files:** none — this task is the release gate.

- [ ] **Step 1: Deploy to staging with the flag off**

Set `VERIFICATION_ALLOW_UNAUTHORISED=true`, `STORAGE_PROVIDER=s3`, a private bucket with Block Public Access and default SSE-S3 encryption, and a `VERIFICATION_HASH_PEPPER`. Run the migration. Confirm:

- every existing screen still works; no verification entry point is visible;
- `GET /api/public/config` returns `verificationEnabled: false`;
- `GET /api/shops/{id}/verification` answers 200 with `enabled: false` for an owner;
- the admin "Verifications to review" tile reads 0, not an error.

- [ ] **Step 2: Enable and run the manual pass**

Record the authorisation fields, tick `enabled`, and with the Didit sandbox:

- identity verification end to end on web, including the return;
- identity verification end to end on mobile, including the return to the app **and** the case where the browser is dismissed without a redirect;
- a declined attempt and a retry;
- a business submission with a PDF and a photo;
- reviewer requests info → seller resubmits → reviewer approves;
- the badge appears on listing cards, listing detail and the shop page, in both languages;
- revoke drops the badge and the shop's listings re-index (check a search result);
- a document URL opened after 60 seconds is refused;
- an unauthenticated `GET` on a private object key returns 403;
- `GET /api/verification-documents/file/{filename}` as an admin returns 403;
- `verification-document-views` holds one row per document opened, and none for any other path.

- [ ] **Step 3: Turn the flag back off with work in flight**

With one request in `submitted` and one in `needs_info`, untick `enabled`. Confirm:

- the seller hub still renders both requests with their status and the reviewer's message;
- seller write routes answer 403 `verification.disabled`;
- the reviewer queue still lists both, and a decision still goes through;
- the nightly purge still runs.

This is the P1 regression in its P2 shape. If any screen blanks, the flag is being read somewhere it must not be — an `access` function or a collection hook.

- [ ] **Step 4: Production**

Record the authorisation in `AppSettings`, confirm `VERIFICATION_ALLOW_UNAUTHORISED` is unset (and would be ignored anyway), confirm `S3_PRIVATE_BUCKET` differs from `S3_BUCKET`, run the migration, then enable.

- [ ] **Step 5: Commit the release note**

```bash
git add docs/superpowers/plans/2026-09-15-p2-verification.md
git commit -m "docs(plans): record the P2 verification staging and production pass"
```

---

## Spec coverage

| Spec section | Tasks |
|---|---|
| Levels and what they unlock | 1, 7, 18 |
| `verification-requests` data model and access | 2, 13 |
| `verification-documents`, `verification-document-views` | 3, 12, 15 |
| `shops` additions (`levelExpiresAt`, `verifiedAt`, `legal`) | 2, 7, 18, 26, 32 |
| `users` changes (`identityVerifiedAt`, virtual `verified`, `legacyVerifiedAt`) | 2, 5, 18 |
| `moderation-log` changes | 2, 8 |
| `webhook-events` gains `didit` | 2, 11 |
| Capabilities helper | 1, 18 |
| Services: transition table, level recomputation, cascades, expiry | 6, 7, 8, 16 |
| Review signals | 9 |
| KYC vendor: interface, Didit adapter, data minimisation, webhook, `processKycEvent` | 10, 11 |
| Seller routes | 13 |
| Reviewer routes, decision rules, reason codes, `moderation/summary` | 14, 15 |
| Private storage, signed URLs, reuse by later phases | 4 |
| Retention and account deletion | 16 |
| Feature flag and data-protection gate | 1, 13, 14, 21, 28, 34 |
| Replacing `users.verified` | 5, 18, 26, 32 |
| Search `minShopLevel` | 19, 26, 32 |
| Notifications | 17 |
| Error codes | 1, 20, 27, 33 |
| Web: badge, seller routes, moderator routes, changes | 20–26 |
| Mobile: routes and changes | 27–32 |
| Internationalisation | 20, 21, 23, 24, 25, 27, 28, 30, 31, 32 |
| Testing (unit, route, clients) | every task; 33 and 34 are the gates |
| Verification targets | 33, 34 |

Out of scope by the spec's own statement and deliberately absent: team members and roles (P3), COD caps (P4), protected payment and payouts (P5), supplier capability (P8), payout-name matching (P5), email verification, a second KYC adapter, verification fees, identity verification for individuals without a shop, and P9's `recordRiskSignal` call (Task 9 leaves the two signals in place for P9 to hook).

---

## Conflicts found while planning

Eleven places where the spec contradicts itself, contradicts the code as it now stands, or would require something `AGENTS.md` forbids. Each carries a ruling and what it costs if the ruling is wrong.

1. **"Shared component `ShopLevelBadge`" vs. the `LevelBadge` P1 already shipped.** Both clients have a `LevelBadge` whose own comment reserves levels 2–3 for P2. **Ruling: extend `LevelBadge`; do not create `ShopLevelBadge`.** Its prop changes from `level: number` to `badge`, and every call site moves in the same commit (Tasks 20, 27). *Cost if wrong:* two badge components drift and a listing card shows a different badge from the shop page — cheap to spot, cheap to fix.

2. **"`@aws-sdk/s3-request-presigner` is installed."** It is present only transitively under `@payloadcms/storage-s3`. **Ruling: declare it in `packages/api/package.json` (Task 4).** *Cost if wrong:* none; declaring a dependency you import is correct regardless.

3. **"Startup throws when `verification.enabled` needs storage and `S3_PRIVATE_BUCKET` is empty."** `buildStoragePlugins()` runs at config build time, before the database is reachable, so it cannot read `AppSettings`. **Ruling: the check is on the environment alone — any deployment with `STORAGE_PROVIDER` set to s3 or azure must have a distinct private bucket or container, flag or no flag (Task 4).** *Cost if wrong:* a deployment that will never enable verification now fails to start until one env var is set. One line in a compose file; the alternative is identity documents landing in the CDN bucket the first time someone ticks the box.

4. **"Seller routes return 403 `verification.disabled`" — all of them.** The spec also says in-flight work must finish. Applying 403 to `GET /api/shops/{id}/verification` blanks the hub for a seller whose request is already in review, which is precisely the failure that cost P1 a fix round. **Ruling: the read route always answers, reporting `enabled: false`; only the write routes refuse (Tasks 13, 21, 28, and pinned in Task 34 Step 3).** *Cost if wrong:* a seller can see a hub for a feature that is off. Against: a seller mid-verification sees an empty screen and contacts support.

5. **"`verified` … `afterRead` sets it to true when the user owns an active shop whose effective level is ≥ 2."** `Users.read` is `anyone` and every listing populates its seller, so a per-document shop query is an N+1 across the entire public surface. **Ruling: derive `verified` from the stored `identityVerifiedAt` alone, in `beforeRead`, with no I/O (Task 5).** The divergence is exactly one case: an owner whose shop is suspended or closed keeps `verified: true` in a *released* app version. Current clients read the badge from the shop's `capabilities`, where suspension is handled correctly. *Cost if wrong:* a stale "Verified" chip in old builds for a suspended seller. Against: a shop query per user document on every listing page.

6. **`ModerationLog.actor` "becomes optional".** P1's `liftExpiredShopSuspensions` already writes `actorRole: "system"` *with* a real actor id. Relaxing `required` without a rule would let any human action be logged anonymously. **Ruling: optional plus a `validate` that demands an actor unless `actorRole === "system"` (Task 2); existing writers keep passing theirs.** *Cost if wrong:* a system entry is refused at write time and a transition rolls back — loud, and caught by Task 8's expiry test.

7. **The spec's `## Current state` is nine months stale in six places** (moderation actions, media limits, the jobs list, the shops index settings, `shops.level` and `writeShop`, web's test harness). **Ruling: the "Current state, re-verified 2026-09-30" table above supersedes it, line by line.** *Cost if wrong:* a task re-creates something P1 shipped. The two that would hurt most are re-implementing `writeShop` (silently stopping the listing re-index on a level change) and re-copying `enforceMediaFileLimits`; both are called out in their tasks.

8. **`signedDownloads` vs. the view log.** The spec rules this itself ("not used, because it has no hook to log the view") but also asks for `verification-documents` access to be `() => false` for admins. Those agree, and together they make Payload's own `/api/verification-documents/file/*` a permanent 403. **Ruling: keep both; Task 34 checks that route returns 403 as an admin.** *Cost if wrong:* a second, unlogged door to identity documents — the one thing the design does not tolerate.

9. **"`web` has no test harness" (P1's belief, carried into the spec's testing section, which lists only typecheck and biome for clients).** Web now has `"test": "bun test"` and four `src/lib/*.test.ts` files. **Ruling: every web task pins its pure logic with `bun test`, and Task 20 adds the `ApiErrors` locale drift test web never had.** *Cost if wrong:* none; more tests than the spec asked for.

10. **Duplicated required-document table.** `requiredDocumentKinds` must exist on the API (to refuse a submit) and on both clients (to disable a button and name what is missing). `AGENTS.md` forbids re-implementing a business rule in a client. **Ruling: accept three copies of this one table, and pin the same cases in all three test files (Tasks 12, 23, 30), so a divergence fails a test rather than shipping.** The alternative — a shared package for one constant — is more machinery than the rule is worth. *Cost if wrong:* a client offers Submit for a request the server refuses; the server still refuses, and three tests disagree loudly.

11. **`minShopLevel` filtered in Meilisearch while `activeShopIds` corrects the level after the fact.** The spec asks for the filter and says nothing about the hydration P1 added, so a stale indexed `shopLevel` of 2 against a live level of 1 would pass the filter and then be displayed as level 1. **Ruling: apply the floor again after hydration (Task 19), and test exactly that case.** *Cost if wrong:* a "Verified shops only" search quietly returns unverified shops — the filter's single promise, broken silently.
