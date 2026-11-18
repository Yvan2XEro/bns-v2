# P2 Verification Design

Date: 2026-09-15
Parent: `2026-09-15-business-layer-design.md`
Depends on: `2026-09-15-p1-shops-design.md` (shops, level 1, shop moderation), `2026-09-15-p0-foundations-design.md` (`webhook-events`, Mongo transactions)

## Goal

Let a shop prove who is behind it. The owner verifies their identity through a KYC vendor to reach level 2, then the business's registration through a manual review to reach level 3. The level is written in one place, read through one helper by every later phase, and shown as a badge buyers can read. Identity documents never touch public storage, every look at them is logged, and they are purged on a schedule. The legacy `users.verified` checkbox goes away.

## Scope

1. `verification-requests`: one request per shop and level, with a status machine, an assignee and a decision.
2. `verification-documents` in a private storage configuration, separate from `media`: signed 60-second URLs, a view log, SHA-256 duplicate detection, a retention purge job.
3. A `KycProvider` interface with one adapter (Didit) for Cameroon CNI or passport, selfie liveness and face match. The vendor reference and result are stored, not raw biometrics.
4. Manual business review for level 3 (RCCM or entreprenant declaration, NIU, legal representative).
5. Level transitions written only by `services/verification.ts`, each with a `moderation-log` entry, and expiry.
6. `lib/shopCapabilities.ts`: the single reader of what a level unlocks.
7. Replacement of `users.verified`: migration, a derived compatibility field, and what the clients show.
8. Reviewer queue routes and moderator screens on web and mobile.
9. Seller submission flows on web and mobile.
10. Notifications, error codes, i18n.
11. A data-protection gate that keeps the feature off until the Law 2024/017 authorisation is recorded.

## Out of scope

- Team members and roles (P3). P2 only uses the owner. Conflict-of-interest checks read `shop-members`, which already exists from P1.
- COD caps per level (P4), protected payment and the payout schedule (P5), supplier capability (P8). P2 defines the capability flags; those phases enforce them and add their own values to `shopCapabilities`.
- Payout-account name matching (P5). P2 exposes the verified name for P5 to compare.
- Email verification. Level 1 stays "verified phone" as in P1.
- A second KYC adapter. Smile ID is the fallback if Didit fails the vendor checklist (see Design, KYC). Adding it only means a new file behind the same interface.
- Verification fees. Verification is free (D2).
- Identity verification for individuals without a shop. Level 2 applies to a shop's owner.

## Current state (verified 2026-09-15)

- `users.verified` is a checkbox (default `false`, sidebar). `Users.beforeChange` clears it on create and pins it on update for anyone but an admin. `Users.afterChange` triggers the push-only Novu workflow `user-verified` when it flips from false to true. No flow sets it: only an admin in the Payload panel can.
- Readers of `verified`:
  - web: `profile/me/page.tsx` (a "verify your account" banner linking to `/support`, which P0 repoints to `/contact`, plus a "Verified Seller" banner) and `profile/[userId]/page.tsx`;
  - mobile: `(tabs)/account/index.tsx`, `profile/[userId].tsx`, `account/edit-profile.tsx` (verified/unverified banner), `listing/[id].tsx` (seller card), `src/types/api.ts` (`UserDoc.verified`);
  - API: `moderation/users/[id]/route.ts` returns it; the admin `ModerationWidget` counts `verified=false` users; `UserManagementClient` shows a column.
  - The mobile locale key `filters.verified` ("Vendeurs vérifiés uniquement") exists, but no code references it.
- `plugins/storage.ts` builds a single adapter (S3, Azure or local) for the `media` collection only. `media` has `read: () => true` and `create: authenticated`; the local `staticDir` is `media/`. Compose defaults `STORAGE_PROVIDER` to `local`.
- `@payloadcms/storage-s3` and `@payloadcms/storage-azure` are 3.79.0. The S3 adapter accepts `acl`, `clientCacheKey` and per-collection `signedDownloads` (default `expiresIn` 7200 s). `@aws-sdk/s3-request-presigner` is installed.
- `ModerationLog`: `actor` is required. Actions are `listing.approve|reject|takedown`, `user.suspend|unsuspend` and `report.resolve|dismiss` (P1 adds `shop.suspend|unsuspend`). `targetType` is `listing|user|report` (P1 adds `shop`). Only `services/moderation.ts` writes it, through `writeLog` with `MODERATION_CONTEXT`.
- `lib/moderationRoute.ts` provides `requireModerator`, `readJson` and `handleModerationError`. `moderation/summary` counts pending listings and reports.
- Mobile moderation: the `moderation/index.tsx` hub has two queues (`listings | reports`), and `moderation/listing|report|user/[id].tsx` are built on `ModerationScreen` and `DecisionSheet`. Web has no moderation screens.
- Jobs: `expireListings`, `expireBoosts`, `checkSearchAlerts`, auto-run on the `nightly` queue.
- Mobile has `expo-image-picker` and `expo-web-browser`, but not `expo-document-picker`.
- No KYC code, no private storage, no verification collections.

## Design

### Levels and what they unlock

| Level | Badge key | Reached when | Unlocks (enforced by) |
|---|---|---|---|
| 0 | none | no shop | classified ads |
| 1 | `phone` | shop created with a verified phone (P1) | shop, COD orders with caps (P4) |
| 2 | `identity` | approved, unexpired level-2 request for the current owner | protected payment (P5), team members (P3), higher COD caps (P4) |
| 3 | `business` | level 2 effective, plus an approved, unexpired level-3 request | supplier capability (P8), faster payouts (P5), "verified" legal block on the shop page |

### Data model

#### `verification-requests`

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, required, indexed | set at creation |
| `requestedLevel` | number | `2` or `3` |
| `submittedBy` | relationship users, required | the shop owner at creation |
| `status` | select `draft`, `submitted`, `in_review`, `needs_info`, `approved`, `rejected`, `revoked`, `expired` | service-written only |
| `statusHistory` | array `{ status, at, actor, source }` | `source`: `seller`, `reviewer`, `vendor`, `system` |
| `openKey` | text | `{shopId}:{level}` while status is `draft`, `submitted`, `in_review` or `needs_info`; `null` otherwise. Partial unique index (`openKey` of type string), created by migration: one open request per shop and level |
| `consent` | group | `acceptedAt`, `version` (e.g. `kyc-2026-10-v1`), `locale` (`fr`, `en`) |
| `kyc` | group | level 2 only, see below |
| `business` | group | level 3 only, see below |
| `documents` | join on `verification-documents.request` | level 3 |
| `reviewSignals` | array `{ code, detail, relatedRequest }` | `code`: `identity_reused`, `name_mismatch`, `underage`, `kyc_declined`, `kyc_review`, `document_reused`, `rccm_reused`, `niu_reused`, `niu_format`. Computed by the service |
| `assignee` | relationship users | set by claim |
| `claimedAt` | date | |
| `infoRequests` | array `{ reasonCode, message, requestedBy, requestedAt, respondedAt }` | |
| `decision` | group | `decidedBy` (users, empty for system), `decidedAt`, `reasonCode`, `sellerMessage` (shown to the owner), `internalNote` (reviewers only), `checklist` (json, level 3) |
| `submittedAt`, `approvedAt`, `expiresAt`, `revokedAt` | date | |
| `supersedes` | relationship verification-requests | the earlier approved request a renewal replaces |
| `previousRequest` | relationship verification-requests | the rejected request this one follows |

`kyc` group:

| Field | Type | Rules |
|---|---|---|
| `provider` | select `didit`, `smileid` | |
| `sessionRef` | text, indexed | vendor session id |
| `status` | select `not_started`, `pending`, `approved`, `declined`, `review`, `abandoned`, `error` | normalised from the vendor |
| `attempts` | number | sessions started on this request, at most 3 |
| `decidedAt` | date | |
| `documentType` | select `national_id`, `passport`, `residence_permit` | |
| `documentCountry` | text | ISO 3166-1 alpha-2 |
| `documentNumberHash` | text, indexed | HMAC-SHA256 of the normalised number, keyed by `VERIFICATION_HASH_PEPPER`. The number itself is never stored |
| `documentNumberLast4` | text | |
| `documentExpiresAt` | date | |
| `givenNames`, `familyName` | text | as read from the document |
| `adult` | checkbox | derived from the date of birth, which is not stored |
| `livenessPassed` | checkbox | |
| `faceMatchScore` | number 0–100 | |
| `vendorWarnings` | json | vendor warning codes only |
| `vendorReviewUrl` | text | link to the case in the vendor console, reviewers only |
| `vendorDataDeletedAt` | date | set when the vendor confirms deletion |

`business` group:

| Field | Type | Rules |
|---|---|---|
| `businessType` | select `entreprenant`, `sole_trader`, `company`, `cooperative` | required to submit |
| `legalName` | text | 2–120 characters |
| `tradeName` | text | optional |
| `rccmNumber` | text | required for `sole_trader`, `company`, `cooperative`; uppercase, collapsed spaces, 8–40 characters of `[A-Z0-9/.\- ]` |
| `entreprenantDeclarationNumber` | text | required for `entreprenant`, same format rule |
| `niu` | text | required; uppercase, 14 characters `[A-Z0-9]`. Not matching `^[A-Z]\d{12}[A-Z]$` adds the `niu_format` signal instead of refusing |
| `registeredAddress` | textarea | required |
| `city` | text | required |
| `legalRepresentativeName` | text | required |
| `legalRepresentativeIsOwner` | checkbox | when false, `legal_representative_id` and `mandate` documents are required |

Access:

- **read:** moderators read everything. The shop owner reads their shop's requests without `reviewSignals`, `assignee`, `claimedAt`, `decision.internalNote`, `decision.checklist`, `kyc.documentNumberHash`, `kyc.faceMatchScore`, `kyc.vendorWarnings` and `kyc.vendorReviewUrl` (field-level `read` limited to moderators).
- **create, update, delete:** closed (`() => false`). `services/verification.ts` writes with `overrideAccess` and `req.context.verificationService = true`.
- `admin.hidden` for non-admins.

#### `verification-documents`

An upload collection, stored only through the private storage configuration.

| Field | Type | Rules |
|---|---|---|
| `request` | relationship verification-requests, required, indexed | |
| `shop` | relationship shops, required, indexed | |
| `kind` | select `rccm_extract`, `entreprenant_declaration`, `niu_certificate`, `legal_representative_id`, `mandate`, `proof_of_address`, `other` | |
| `sha256` | text, indexed | computed in `beforeChange` from `req.file.data` |
| `originalFilename` | text | readable by reviewers; the stored `filename` is `{uuid}.{ext}` |
| `uploadedBy` | relationship users | |
| `duplicateOf` | relationship verification-documents, hasMany | earlier documents with the same `sha256` on another shop |
| `purgedAt` | date | file deleted, row kept |

Upload rules: `mimeTypes` are `image/jpeg`, `image/png`, `image/webp` and `application/pdf`; `filesizeLimit` is 10 MB; no `imageSizes`, crop or focal point; metadata is stripped. At most 10 documents per request.

Access: `read`, `create`, `update` and `delete` are all `() => false`, for admins too, and `admin.hidden: true`. Payload's own file route (`/api/verification-documents/file/*`) therefore always answers 403. The only way to see a file is the signed-URL route, which logs the view.

#### `verification-document-views`

Append-only, written only by the signed-URL route.

| Field | Type | Rules |
|---|---|---|
| `document` | relationship verification-documents, required, indexed | |
| `request` | relationship verification-requests, required | |
| `viewer` | relationship users, required, indexed | |
| `viewerRole` | text | snapshot |
| `ipHash` | text | SHA-256 of the IP with `VERIFICATION_HASH_PEPPER` |
| `userAgent` | text | truncated to 200 characters |
| `createdAt` | date | |

Access: read by admins only; create, update and delete closed.

#### `shops` (additions)

| Field | Type | Rules |
|---|---|---|
| `levelExpiresAt` | date | earliest `expiresAt` of the requests backing the current level; service-written only |
| `verifiedAt` | date | when level 2 was first reached; service-written only |
| `legal` | group | `businessType`, `legalName`, `rccmNumber`, `niu` (public), `verifiedAt` (service-written) |

- Owners and managers can edit `legal` while the effective level is below 3; it is shown as "declared" (D5: displayed whenever provided).
- On level-3 approval the service overwrites `legal` with the reviewed values and sets `legal.verifiedAt`.
- While level 3 is effective, `legal` is pinned in `beforeChange`, so a change needs a new level-3 request.
- `levelExpiresAt`, `verifiedAt` and `legal.verifiedAt` join P1's service-owned field list.

#### `users` (changes)

| Field | Type | Rules |
|---|---|---|
| `identityVerifiedAt` | date | set on level-2 approval, cleared on revoke or expiry; read by self and staff; service-written only |
| `identityVerification` | relationship verification-requests | the approved level-2 request; read by staff |
| `verified` | checkbox, virtual | no longer stored. `afterRead` sets it to true when the user owns an active shop whose effective level is ≥ 2. Kept so released app versions show "Verified" only for real identity verification |
| `legacyVerifiedAt` | date | admin-only read, hidden; filled by the migration |

`beforeChange` stops touching `verified`. The `user-verified` trigger in `afterChange` is removed.

#### `moderation-log` (changes)

- `targetType` gains `verification-request`.
- `MODERATION_ACTIONS` gains `verification.claim`, `verification.release`, `verification.request_info`, `verification.approve`, `verification.reject`, `verification.revoke` and `verification.expire`. `release` and `expire` are needed for stale claims and scheduled expiry, which also change state.
- `actor` becomes optional, with a `validate` that requires it unless `actorRole === "system"`. System entries (automatic approval, expiry, stale-claim release) carry `actorRole: "system"`.

#### `webhook-events` (P0, change)

`provider` gains `didit` (and `smileid` when that adapter exists).

### Capabilities helper

`packages/api/src/lib/shopCapabilities.ts`, pure and without I/O:

```ts
export interface ShopCapabilities {
  effectiveLevel: 0 | 1 | 2 | 3;
  badge: "phone" | "identity" | "business" | null;
  codOrders: boolean;        // P4
  protectedPayment: boolean; // P5
  teamMembers: boolean;      // P3
  maxMembers: number;        // P3, owner included
  supplier: boolean;         // P8
  fasterPayouts: boolean;    // P5
  legalInfoVerified: boolean;
}
export function shopCapabilities(
  shop: { status: string; level: number; levelExpiresAt?: string | Date | null },
  now?: Date,
): ShopCapabilities;
```

Rules:

- `status !== "active"` → effective level 0, badge `null`, every flag false, `maxMembers` 1.
- `level >= 2` with `levelExpiresAt` in the past → effective level 1. As with `suspensionSummary`, expiry is a comparison at read time, so a late job never over-grants.
- Level 1: `codOrders`, `maxMembers: 1`.
- Level 2: adds `protectedPayment`, `teamMembers`, `maxMembers: 5`.
- Level 3: adds `supplier`, `fasterPayouts`, `legalInfoVerified`, `maxMembers: 20`.

Every later phase reads capabilities through this function and never compares `shop.level` directly. P4 adds COD cap values keyed by `effectiveLevel` to the same file. API responses that manage a shop (`GET /api/shops/{id}` and the seller hub endpoints) include `capabilities`, so clients never recompute them. The public shop lookup returns `level` and `badge` only.

### Services

`services/verification.ts` owns every write to the three verification collections, the verification fields on `shops` and `users`, and the related `moderation-log` entries. Each transition runs in one Payload transaction together with its log entry.

#### Transition table

| From | To | Who | Log action |
|---|---|---|---|
| — | `draft` | owner | none |
| `draft` | `submitted` | owner (level 3), vendor result (level 2) | none |
| `draft` | `expired` | system, 30 days without activity | `verification.expire` |
| `submitted` | `in_review` | reviewer claim | `verification.claim` |
| `in_review` | `submitted` | assignee release, or system after 48 hours idle | `verification.release` |
| `in_review` | `needs_info` | assignee | `verification.request_info` |
| `in_review` | `approved` | assignee | `verification.approve` |
| `submitted` | `approved` | system, level 2 only, when `autoApproveIdentity` is on and there are no signals | `verification.approve` (`metadata.automatic: true`) |
| `in_review` | `rejected` | assignee | `verification.reject` |
| `needs_info` | `submitted` | owner resubmits | none |
| `needs_info` | `expired` | system, 30 days without response | `verification.expire` |
| `approved` | `revoked` | moderator | `verification.revoke` |
| `approved` | `expired` | system at `expiresAt`, or superseded by a renewal | `verification.expire` |

`rejected`, `revoked` and `expired` are terminal. Anything else → 409 `verification.invalidTransition`.

#### Level recomputation

`recomputeShopLevel(req, shopId, cause)` runs inside every transition that can change a level:

1. Level 1 is the floor for an active shop.
2. Level 2 if an `approved` level-2 request with `expiresAt > now` exists and its `submittedBy` is the current `shop.owner`.
3. Level 3 if level 2 holds and an `approved` level-3 request with `expiresAt > now` exists.
4. `levelExpiresAt` = the earliest `expiresAt` among the backing requests.
5. Write through `services/shops.ts` `setShopLevel(req, shopId, { level, levelExpiresAt, verifiedAt })` with `req.context.shopService = true`. No other code writes `shops.level`.
6. When the level changed:
   - publish `shop.updated` (P1 re-indexes the shop's listings on a level change);
   - call the listeners registered with `onShopLevelChanged(listener)` in `services/shops.ts`, with `(req, { shopId, previousLevel, level, cause })`. P3 registers the team pause; P4 and P5 register their own.

Expiry dates on approval:

- Level 2: `min(approvedAt + 24 months, kyc.documentExpiresAt)`.
- Level 3: `approvedAt + 24 months`.

Renewal: the owner can open a new request for the same level from 60 days before `expiresAt`. Its approval moves the old request to `expired` with `metadata.supersededBy`.

Cascades:

- Revoking or expiring level 2 also moves an approved level-3 request of the same shop to `revoked` (on revoke) or leaves it approved (on expiry), and recomputation drops the shop to level 1 either way. The cascaded ids go in the log metadata.
- Closing a shop (P1) moves its open requests to `expired` (`cause: shop_closed`). Approved requests stay; capabilities are already false for a closed shop.
- Suspending a shop or its owner changes no request and no level. Capabilities are empty while the shop is suspended.

#### Review signals

Computed on vendor result and on level-3 submit, stored in `reviewSignals`, and never blocking on their own:

- `identity_reused`: the same `kyc.documentNumberHash` on an approved or open request whose `submittedBy` is another user.
- `name_mismatch`: no token overlap between the normalised owner `users.name` and `givenNames` + `familyName`. Normalisation lowercases, strips accents and drops tokens under 2 characters.
- `underage`: `adult` is false.
- `kyc_declined` / `kyc_review`: vendor outcome.
- `document_reused`: `duplicateOf` is not empty.
- `rccm_reused` / `niu_reused`: the same normalised value on another shop's request.
- `niu_format`: see `business.niu`.

Once P9 ships, `identity_reused` and `document_reused` also call P9's `recordRiskSignal` (signal `identity.duplicate_document`) after commit. Any signal already keeps the request out of automatic approval.

### KYC vendor

`packages/api/src/lib/kyc/types.ts` (mirrors `lib/payments`):

```ts
export interface KycProvider {
  id: "didit" | "smileid";
  createSession(input: {
    reference: string;              // VR-{requestId}-{attempt}
    locale: "fr" | "en";
    returnUrl: string;
  }): Promise<{ sessionRef: string; url: string; expiresAt: Date }>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<{
    providerEventId: string; type: string; sessionRef: string;
  }>;
  fetchResult(sessionRef: string): Promise<KycResult>;
  deleteSessionData(sessionRef: string): Promise<void>;
}

export interface KycResult {
  status: "pending" | "approved" | "declined" | "review" | "abandoned";
  documentType: "national_id" | "passport" | "residence_permit" | null;
  documentCountry: string | null;
  documentNumber: string | null;   // transient: hashed, then discarded
  documentExpiresAt: Date | null;
  givenNames: string | null;
  familyName: string | null;
  dateOfBirth: Date | null;        // transient: reduced to `adult`
  livenessPassed: boolean;
  faceMatchScore: number | null;
  warnings: string[];
  reviewUrl: string | null;
}
```

`lib/kyc/didit.ts` implements it with Didit's hosted verification session: document capture, passive liveness and face match run on Didit's pages, so the app ships no native SDK. Webhook signatures use `timingSafeEqual`. Secrets: `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_WORKFLOW_ID`.

Data minimisation (Law 2024/017):

- BuyNSellem never receives or stores selfie, face or document images from the vendor. `fetchResult` reads only the fields above.
- The document number and date of birth exist only in memory during `processKycEvent`.
- `deleteSessionData` runs 30 days after `kyc.decidedAt`, driven by the retention job, and sets `vendorDataDeletedAt`.

Vendor checklist, completed before the adapter is merged and recorded in the processing register: Cameroon CNI (both card generations) and passport supported; liveness and face match included; a deletion API or contractual deletion within 30 days; processing location, for the transfer authorisation; per-verification price. If Didit fails an item, `lib/kyc/smileid.ts` is written against the same interface and `verification.kycProvider` is switched. Nothing else changes.

Webhook route `POST /api/public/verification/webhook/[provider]` follows P0's four steps: verify, insert into `webhook-events`, 500 on insert failure, 200 plus job. Job `processKycEvent`, retried up to five times:

1. `fetchResult`, then find the request by `kyc.sessionRef`.
2. Write the `kyc` group and compute signals.
3. Outcome:
   - `approved` → `submitted`, then automatic approval if allowed, otherwise the request waits in the queue;
   - `review` → `submitted` with signal `kyc_review`;
   - `declined` → stays `draft` with `kyc.status: declined` while `attempts < 3`, so the owner can retry; at the third decline → `submitted` with signal `kyc_declined`, for a human decision;
   - `abandoned` or `pending` → no transition.

Rejections are always made by a person.

### Routes

#### Seller

All require authentication, an active shop, caller `=== shop.owner`, the caller not suspended, and `verification.enabled`. Errors are listed below.

| Route | Behaviour |
|---|---|
| `GET /api/shops/{id}/verification` | current `capabilities`, `levelExpiresAt`, the latest request per level (owner-visible fields), what the next level unlocks, `renewableFrom` |
| `POST /api/shops/{id}/verification-requests` | body `{ level }`; creates a `draft` or returns the open one. Level 3 requires effective level 2. Refused during a cooldown: 24 hours after a rejection, 7 days after a rejection with reason `fraud_suspected` |
| `POST /api/verification-requests/{id}/kyc-session` | level 2, `draft`; body `{ consentVersion, locale }`. Records `consent`, enforces 3 attempts per request and 5 sessions per owner per 30 days, creates the vendor session, returns `{ url }`. The URL is not stored |
| `PATCH /api/verification-requests/{id}/business` | level 3, `draft` or `needs_info`; validates and normalises the `business` group |
| `POST /api/verification-requests/{id}/documents` | multipart `file` + `kind`; `draft` or `needs_info`; creates the document through the private collection, computes `sha256` and `duplicateOf` |
| `DELETE /api/verification-requests/{id}/documents/{docId}` | `draft` or `needs_info`; deletes the file and row |
| `POST /api/verification-requests/{id}/submit` | level 3; checks the required fields and documents, then `draft`/`needs_info` → `submitted` and fills `infoRequests[].respondedAt` |
| `DELETE /api/verification-requests/{id}` | `draft` only; deletes the request and its files |

Required documents per business type:

- `entreprenant`: `entreprenant_declaration`, `niu_certificate`.
- `sole_trader`, `company`, `cooperative`: `rccm_extract`, `niu_certificate`.
- When `legalRepresentativeIsOwner` is false: add `legal_representative_id` and `mandate`.

#### Reviewer

Built on `requireModerator` and `handleModerationError`.

| Route | Behaviour |
|---|---|
| `GET /api/moderation/verification?queue=to_review\|mine\|needs_info\|decided&level=&signal=&cursor=` | `to_review`: `submitted` ordered by `submittedAt`, with resubmissions first; `mine`: `in_review` assigned to the caller; `decided`: last 30 days |
| `GET /api/moderation/verification/{id}` | request (all fields); shop (handle, name, level, status, owner public profile, phone-verified date); the owner's other requests; document metadata without URLs; `moderation-log` history for the request |
| `POST /api/moderation/verification/{id}` | body `{ action, reasonCode?, sellerMessage?, note?, checklist?, force? }` with `action`: `claim`, `release`, `request_info`, `approve`, `reject`, `revoke` |
| `POST /api/moderation/verification/documents/{docId}/view` | caller must be the request's assignee, or an admin. Inserts a `verification-document-views` row, then returns `{ url, expiresAt }` valid 60 s. If the insert fails, no URL is returned |

Decision rules:

- Only the assignee can `request_info`, `approve` or `reject`. `claim` with `force: true` (admin only) takes over another reviewer's claim.
- `request_info` and `reject` require `reasonCode` and `sellerMessage`. `revoke` requires `reasonCode`.
- Level-3 `approve` requires `checklist` with every item true:
  - `name_matches_registry`;
  - `registration_number_matches_document`;
  - `niu_matches_certificate`;
  - `representative_matches_identity_or_mandate`;
  - `documents_legible_and_current`.
- Conflict of interest: a reviewer who owns the shop or has an active `shop-members` row in it gets 403 `verification.conflictOfInterest`.
- Rank: `canActOn(actor, shopOwner)` must hold, as for shop suspension in P1.

Reason codes:

- `request_info`: `document_unreadable`, `document_missing`, `information_inconsistent`, `kyc_retry`, `other`.
- `reject`: `document_invalid`, `document_expired`, `identity_mismatch`, `liveness_failed`, `business_mismatch`, `duplicate_identity`, `fraud_suspected`, `other`.
- `revoke`: `fraud`, `document_forged`, `business_closed`, `identity_reused`, `other`.

`moderation/summary` adds `pendingVerifications`: `submitted` plus `in_review` unclaimed for 48 hours, included in `total`.

### Private storage

`plugins/storage.ts` returns two plugins when the provider is not `local`:

- **S3:**
  - the existing `media` plugin is unchanged;
  - a second `s3Storage` covers `collections: { "verification-documents": { prefix: "verification" } }` with `bucket: S3_PRIVATE_BUCKET`, `acl: "private"` and `clientCacheKey: "s3:private"`;
  - the bucket has Block Public Access and default SSE-S3 encryption;
  - startup throws when `verification.enabled` needs storage and `S3_PRIVATE_BUCKET` is empty or equal to `S3_BUCKET`.
- **Azure:** a second `azureStorage` with `AZURE_STORAGE_PRIVATE_CONTAINER_NAME`, private access level, and the same startup checks.
- **Local:** `verification-documents.upload.staticDir` = `PRIVATE_UPLOADS_DIR`, default `private-uploads/verification`, outside `media/`. Refused at startup when `NODE_ENV === "production"`.

`lib/privateFiles.ts` exports `createSignedDocumentUrl(doc, ttlSeconds = 60)`:

- **S3:** `getSignedUrl(GetObjectCommand)` with `ResponseContentDisposition: inline`, `ResponseCacheControl: no-store`.
- **Azure:** a read-only SAS for 60 s.
- **Local:** `/api/verification/files/{docId}?exp=&sig=`, HMAC-SHA256 over `docId:exp` with a key derived from `PAYLOAD_SECRET`. The route streams the file with `Cache-Control: no-store` and 403s an expired or wrong signature.

`signedDownloads` of the plugin is not used, because it has no hook to log the view.

**Reuse by later phases.** The private adapter is the only storage for non-public files in the whole initiative. Later phases add their upload collections to it, each with its own prefix and the same startup checks: `buyer-fee-invoices` and the `payments.gates` evidence (P5), `dispute-evidence` and dispute certificates (P6), `delivery-proofs` (P7), the `resale.gates` evidence (P8). `createSignedDocumentUrl(doc, ttlSeconds)` accepts a document of any of these collections; each phase sets its own TTL and access check. `verification-document-views` stays specific to identity documents; a phase that must log views of its own files keeps its own log.

### Retention

`lib/verificationRetention.ts` holds the periods declared in the processing register. Job `purgeVerificationData` runs nightly on the `nightly` queue.

| Data | Kept until | Action |
|---|---|---|
| Document files, request `rejected`, `expired` or `revoked` (reason not `fraud`/`document_forged`) | 90 days after the terminal status | delete file, set `purgedAt` |
| Document files, request revoked for `fraud` or `document_forged` | 365 days after revocation | same |
| Document files, request `approved` | the request leaves `approved` | then the rule above |
| Vendor-side KYC data | 30 days after `kyc.decidedAt` | `deleteSessionData`, set `vendorDataDeletedAt`; retried nightly until it succeeds |
| Request rows (names, business fields, decision texts) | 5 years after the terminal status | clear `kyc` names, `business`, `sellerMessage` and `internalNote`; delete `documentNumberHash` |
| `verification-document-views` | 3 years | delete |
| Hashes (`sha256`, `documentNumberHash`) of a deleted account | 1 year after account deletion | delete |

Account deletion (`deleteUserRelatedData`) purges every document file of the user's shops immediately, clears `kyc` names, deletes open requests, and keeps decided request rows stripped of names for the fraud-prevention hash window above.

### Feature flag and data-protection gate

`AppSettings` gains a `verification` group:

- `enabled` (checkbox, default `false`);
- `kycProvider` (select `didit`, `smileid`; default `didit`);
- `autoApproveIdentity` (checkbox, default `false`: every identity decision is human at launch);
- `authorisation`: `reference` (text), `grantedAt` (date), `transfersAuthorised` (checkbox), `consentVersion` (text).

A `beforeChange` validation refuses `enabled: true` unless `authorisation.reference`, `grantedAt`, `consentVersion` and `transfersAuthorised: true` are all set. Staging bypasses it only with `VERIFICATION_ALLOW_UNAUTHORISED=true`, which is ignored when `NODE_ENV === "production"`.

`GET /api/public/config` exposes `verificationEnabled`. When disabled:

- seller routes return 403 `verification.disabled`;
- clients hide every verification entry point;
- webhooks, reviewer routes and the purge job keep running, so in-flight work finishes and retention still applies.

The consent screen text (bilingual) names what is collected, the vendor and its processing country, retention periods, the right to access and delete, and the contact address. Its version must equal `authorisation.consentVersion`, otherwise `verification.consentRequired`. The privacy page on web and mobile gains the same section.

### Replacing `users.verified`

- **Migration** `src/migrations/{timestamp}_verification_levels.ts`, idempotent:
  - for users with a stored `verified: true`, set `legacyVerifiedAt = updatedAt`;
  - `$unset` `verified` on every user;
  - create the `openKey` partial unique index.
  - It grants no level: the legacy checkbox checked nothing.
- **API:** `verified` becomes the virtual field above. `moderation/users/[id]` returns `identityVerifiedAt` and the owned shop's `badge` instead of `verified`. The admin `ModerationWidget` "Unverified Users" tile becomes "Verifications to review" (`pendingVerifications`). `UserManagementClient` shows "Identity verified" from `identityVerifiedAt`.
- **Clients:** the person-level "Verified" badge disappears. Badges now belong to shops, via the shared badge component below.
  - A public profile shows the badge of the shop the user owns, if any.
  - `profile/me` (web) and `account/edit-profile` (mobile) replace the verified/unverified banners with: owner → level badge and "Increase your level" to the verification hub; no shop → nothing.
  - `UserDoc.verified` stays in mobile types, marked deprecated, and is no longer read.

### Search

- `GET /api/public/search` accepts `minShopLevel` (1–3): `shopLevel >= n`, through `quoteFilterValue`.
- `GET /api/public/search/shops` accepts the same.
- The mobile filter key `filters.verified` is reused for a "Verified shops only" toggle (`minShopLevel=2`), and web adds the same filter.

### Notifications

New Novu workflows in `syncNotificationWorkflows.ts`. Payloads carry no document data.

| Workflow | Recipient | Channels | Trigger |
|---|---|---|---|
| `verification-needs-info` | owner | in-app, push, email | `request_info`: level, reason, seller message, link to the request |
| `verification-approved` | owner | in-app, push, email | approval: new level and what it unlocks |
| `verification-rejected` | owner | in-app, push, email | rejection: reason, seller message, date a new request is allowed |
| `verification-revoked` | owner | in-app, push, email | revocation: reason, resulting level |
| `verification-expiring` | owner | in-app, push, email | 30 and 7 days before `levelExpiresAt`, from the purge job's run |

`user-verified` is no longer triggered; its definition stays in the script for one release so stale in-app tags still resolve.

### Error codes

Added to `lib/errors.ts`, with English fallbacks and translations in both clients:

- `verification.disabled`
- `verification.notOwner`
- `verification.levelNotEligible`
- `verification.requestOpen`
- `verification.cooldown`
- `verification.invalidTransition`
- `verification.consentRequired`
- `verification.tooManyAttempts`
- `verification.kycUnavailable`
- `verification.documentLimit`
- `verification.documentsMissing`
- `verification.fieldsInvalid`
- `verification.notAssignee`
- `verification.conflictOfInterest`
- `verification.checklistIncomplete`

Uploads reuse `upload.tooLarge` and `upload.invalidType`.

### Web

**Shared component:** `ShopLevelBadge` (`phone` "Phone verified", `identity` "Verified identity", `business` "Verified business"), used on listing cards, listing detail, `/s/[handle]` and search results.

**New seller routes** (sidebar entry "Verification"):
- `/seller/verification`: the hub.
  - Current badge and expiry; a ladder of levels 1–3 with what each unlocks.
  - Request status timeline and the reviewer's message on `needs_info` or `rejected`.
  - Renewal entry from `renewableFrom`.
- `/seller/verification/identity`: consent screen, then "Start" opens the vendor URL in the same tab.
- `/seller/verification/identity/return?request=&app=`: polls `GET /api/shops/{id}/verification` every 3 s for up to 2 minutes. With `app=1` it first redirects to `buynsellem://seller/verification/return?request=`.
- `/seller/verification/business`: business form, one upload slot per required document kind (drag and drop, preview of images, delete), a submit button enabled when everything required is present.

**New moderator routes**, the first web moderation screens. Non-moderators get the not-found page. Other queues stay on mobile.
- `/moderation/verification`: queue tabs To review, Mine, Waiting on seller, Decided; filters for level and signal; age and signal chips.
- `/moderation/verification/[id]`: review page.
  - Left column: shop and owner, KYC summary (outcome, document type and country, last 4, expiry, names, liveness, face-match score, vendor console link), business fields with format warnings, signals with links to related requests, level-3 checklist.
  - Right column: document viewer, which requests a signed URL on open and on expiry, showing images in `<img>` and PDFs in `<iframe>`. The private bucket origin is added to the web app's `img-src` and `frame-src` if a CSP is set.
  - Sticky action bar: Claim / Release, Request info, Approve, Reject, Revoke, each with reason and message fields.

**Changes:**
- `/s/[handle]`: the badge reflects the level; a legal block "RCCM … · NIU …" appears when `legal` is set, labelled "Verified" when `legal.verifiedAt` is set, otherwise "Declared by the shop".
- `/shop/manage`: `legal` fields, read-only at level 3.
- `profile/me`, `profile/[userId]`: as described in "Replacing `users.verified`".
- Search: the "Verified shops only" filter.

### Mobile

**New routes**, registered in `app/_layout.tsx` with `headerShown: false`:
- `app/seller/verification/index.tsx`: the hub, same content as web.
- `app/seller/verification/identity.tsx`: consent, then `WebBrowser.openAuthSessionAsync(url, "buynsellem://seller/verification/return")`, with `returnUrl` set to the web return page with `app=1`.
- `app/seller/verification/return.tsx`: polls like the web return page. It also refetches when the app returns to the foreground, in case the auth session closed without a redirect.
- `app/seller/verification/business.tsx`: the form, with document slots using `expo-image-picker` (camera or library) for images and `expo-document-picker` (new dependency, SDK 57 version) for PDFs.
- `app/moderation/verification/[id].tsx`: the review sheet, built on `ModerationScreen` and `DecisionSheet`.
  - Images are shown with `expo-image` and `cachePolicy="none"`; PDFs open with `WebBrowser.openBrowserAsync`.
  - The level-3 checklist is a list of switches.

**Changes:**
- `moderation/index.tsx`: `QueueKey` gains `verification`, fed by `GET /api/moderation/verification?queue=to_review`, with the count from `pendingVerifications`.
- Shop hub (`app/seller/index.tsx`): a "Verification" tile showing the badge and any pending state.
- `ShopLevelBadge` component on listing cards, `listing/[id].tsx` seller card (replacing `seller.verified`), `s/[handle].tsx` (plus the legal block), `profile/[userId].tsx` and `(tabs)/account/index.tsx`.
- `account/edit-profile.tsx`: banner replaced as on web.
- Filters: "Verified shops only".
- Deep link `buynsellem://seller/verification/return` resolves through expo-router.

### Internationalisation

Every new string in English and French on web (next-intl) and mobile (i18next) in the same change:

- badges;
- level ladder copy;
- consent text;
- every reason code under `verification.reasons.*`;
- checklist items;
- signal labels (reviewer screens);
- error codes;
- notification copy.

Seller messages typed by reviewers are free text in the reviewer's language.

## Testing

**Unit tests:**
- Transition table: every allowed and forbidden transition, including terminal states.
- `openKey`: a second open request for the same shop and level is refused; a new one after a terminal status is allowed.
- `recomputeShopLevel`:
  - level 2 alone;
  - level 3 without level 2 stays 1;
  - expiry by date without a job run (through `shopCapabilities`);
  - level-2 revoke cascades to level 3;
  - a renewal supersedes the old approval;
  - an owner mismatch does not count;
  - listeners fire once per change and not when the level is unchanged.
- `shopCapabilities`: every level × `active | suspended | closed` × expired and unexpired.
- Signals:
  - identity reuse across users;
  - name mismatch with accents and word order;
  - `sha256` duplicate across shops;
  - RCCM and NIU reuse;
  - NIU format warning.
- `processKycEvent`:
  - approved, review, declined three times, abandoned;
  - duplicate webhook;
  - the stored request contains neither the document number nor the date of birth.
- Didit adapter: signature valid and invalid (and no secret in logs), result normalisation from fixtures.
- Document view: a row is written before the URL is returned; a failing insert returns no URL; a non-assignee moderator gets 403; an admin gets through.
- Signed URLs: S3 presign carries `expiresIn: 60`; the local HMAC route refuses expired and tampered signatures.
- Storage plugin: `media` stays on the public bucket and `verification-documents` on the private one; startup fails with an empty or identical `S3_PRIVATE_BUCKET`; local provider refused in production.
- Purge job: each retention row, rows kept with `purgedAt`, vendor deletion retried until success.
- AppSettings gate: enable refused without authorisation fields; the staging bypass is ignored in production.
- `users.verified` virtual: owner of a level-2 active shop → true; suspended shop → false; no shop → false.
- Migration run twice on a fixture: the second run changes nothing.
- A transition whose log write fails rolls back the status and the level.
- Conflict of interest and the rank rule.

**Route tests:**
- Seller routes: owner only, level-3 eligibility, cooldown, document kinds and limits, submit with missing documents.
- Reviewer routes: claim race (two claims, one wins), release, request info then resubmit, approve with an incomplete checklist (400), reject, revoke.
- Webhook route with a Didit fixture.
- `moderation/summary` includes `pendingVerifications`.

**Clients:**
- Typecheck and biome on web and mobile.
- Manual pass on both with the Didit sandbox:
  - identity verification end to end, including the return to the app;
  - declined attempt and retry;
  - business submission with a PDF and a photo;
  - reviewer requests info, seller resubmits, reviewer approves;
  - badge appears on listings and the shop page;
  - revoke drops the badge and listings re-index;
  - open a document URL after 60 s and confirm it is refused.

## Verification targets

- `bun run generate:types` in `packages/api`
- `bun run check-types` in `packages/api`, `packages/web`, `packages/mobile`, `packages/search-indexer`
- `bunx vitest run --config ./vitest.config.mts` in `packages/api`
- `bun test` in `packages/mobile`
- `bunx biome check` on touched files
- Staging with `VERIFICATION_ALLOW_UNAUTHORISED=true` and a private bucket:
  - the manual pass above;
  - an unauthenticated `GET` on a private object key returns 403;
  - `GET /api/verification-documents/file/{filename}` as an admin returns 403.
- Production: record the authorisation in `AppSettings`, then enable.
