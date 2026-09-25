# P3 Team Design

Date: 2026-09-15
Parent: `2026-09-15-business-layer-design.md`
Depends on: `2026-09-15-p1-shops-design.md` (shops, `shop-members`, `access/shopRoles.ts`), `2026-09-15-p2-verification-design.md` (`shopCapabilities`, `onShopLevelChanged`)

## Goal

Let a verified shop work as a team. The owner invites managers and staff by phone or email, each role sees and does only what it should, every member action leaves a trace, and buyer conversations land in one shared shop inbox where they can be assigned and answered by any member instead of the owner's personal phone.

## Scope

1. `shop-invitations`: invite by phone or email with a hashed token and expiry; accept flow for existing and new accounts.
2. `manager` and `staff` roles with a permission matrix enforced in one helper.
3. Member management: change role, remove, leave, per-member inbox notification preference.
4. `shop-activity-log`: append-only record of member actions.
5. Shop inbox:
   - conversations gain `shop`;
   - messages are routed to active members;
   - assignment, open/done status and per-member read state.
6. chat-service membership checks at join and at send, with cache invalidation and socket eviction on revoke.
7. Removal, suspension, closure and level-drop effects.
8. Team size limits by level.
9. Web and mobile screens, notifications, error codes, i18n.
10. Fixes in the messaging layer that a shared inbox depends on: sender forgery, participant edits, conversation creation with arbitrary participants, and web mark-read.

## Out of scope

- Ownership transfer and multiple owners.
- Custom roles or per-permission overrides.
- Order permissions in practice: the matrix names them, P4 enforces them.
- Payment permissions in practice (P5), resale permissions in practice (P8).
- Canned replies, response-time metrics, inbox SLAs (P9).
- Unread counts on the personal Messages list: mobile reads a `conversations.unreadCount` the API never sets; unchanged in P3.
- Universal links for `/invite/{token}` (same follow-up as P1).
- Retention of order-linked conversations on account deletion (P4).

## Current state (verified 2026-09-15)

- **`conversations`:**
  - fields: `participants` (users, hasMany, required), `listing`, `lastMessage`, `updatedAt`;
  - `read`: participants, plus admin and moderator;
  - `create`: any authenticated user, with no hook: the caller does not have to be among `participants`;
  - `update`: participants or admin, with no hook: a participant can rewrite `participants`.
- **`messages`:**
  - `create`: authenticated.
  - `beforeChange` takes `sender` from the body when present, otherwise from `req.user`. It exists so chat-service can persist under its service account, but it also lets any REST caller set another user as sender.
  - It checks the sender's suspension and blocks between the sender and the other participants. It does not check that the sender takes part in the conversation.
  - `read` is scoped to conversations where the user is a participant, with the ids cached in `req.context.messageReadConversationIds`.
  - `update` is admin or moderator only.
  - `afterChange` triggers `new-message` to every participant except the sender.
- **Read state:**
  - a single `messages.read` boolean;
  - web `messages-client.tsx` marks messages read with `PATCH /api/messages/{id}`, which the update rule refuses for regular users;
  - chat-service marks them read on `message:read` under its service token;
  - `GET /api/public/messages/unread` counts `read = false` messages not sent by the user, across up to 200 conversations.
- **Conversation start:** web `messages/page.tsx` and mobile `listing/[id].tsx` look up any conversation that has the seller as participant, whatever the listing, and otherwise `POST /api/conversations` with `[me, seller]`.
- **chat-service:**
  - `verifyTokenCached` caches `/users/me` for 25 minutes under `auth:token:{sha256}`;
  - `getParticipants` caches `conv:{id}:participants` for 10 minutes;
  - `invalidateParticipants` exists but is only referenced by tests;
  - `hasConversationAccess` runs on `conversation:join` only. `message:send` does not check access and persists through the API, which does not check it either;
  - each socket joins `user:{userId}`; the Socket.IO Redis adapter is configured;
  - the service account logs in with `CHAT_SERVICE_EMAIL`. Its PATCH calls on messages and conversations only pass current access rules if it holds `admin` (inferred from the rules; the account is provisioned outside the repo).
- **Reports:** `targetType` is `listing|user|message` (P1 adds `shop`).
- **Account deletion:** `deleteUserRelatedData` deletes every conversation the user takes part in and every message they sent.
- **From P1:**
  - `shop-members` has `role owner|manager|staff` and `status active|revoked`, with owner rows only;
  - `resolveShopRole` and `canManageShop` exist;
  - listings with `shop` keep `seller` = the member who published;
  - product costs are readable by any member.

## Design

### Roles and permissions

`access/shopRoles.ts` gains the permission list and a pure check:

```ts
export type ShopPermission =
  | "catalogue.edit" | "catalogue.archive" | "stock.move"
  | "costs.view" | "costs.edit"
  | "orders.view" | "orders.process" | "orders.cancel"
  | "inbox.reply" | "inbox.assignOthers"
  | "payments.view" | "payments.manage"
  | "team.view" | "team.inviteStaff" | "team.manageManagers"
  | "settings.edit" | "settings.handle" | "verification.submit"
  | "resale.manage" | "activity.view" | "shop.close";
export function can(role: ShopRole | null, permission: ShopPermission): boolean;
export async function requireShopPermission(
  req: PayloadRequest, shopId: string, permission: ShopPermission,
): Promise<{ role: ShopRole; shop: ShopDoc }>;
```

| Area | Permission | Owner | Manager | Staff |
|---|---|---|---|---|
| Catalogue | `catalogue.edit`: create and edit products, publish | yes | yes | yes |
| Catalogue | `catalogue.archive`: archive products, detach listings | yes | yes | no |
| Stock | `stock.move`: receipts, adjustments, losses, returns | yes | yes | yes |
| Costs | `costs.view`: `cost`, margin, stock value, stock summary | yes | yes | no |
| Costs | `costs.edit` | yes | yes | no |
| Orders (P4) | `orders.view` | yes | yes | yes |
| Orders (P4) | `orders.process`: confirm, accept, ship, handover | yes | yes | yes |
| Orders (P4) | `orders.cancel`: seller cancellation, refunds (P5) | yes | yes | no |
| Messages | `inbox.reply`: read and answer shop conversations, assign to self | yes | yes | yes |
| Messages | `inbox.assignOthers` | yes | yes | no |
| Payments (P5) | `payments.view`: payouts, commission invoices | yes | yes | no |
| Payments (P5) | `payments.manage`: payout account | yes | no | no |
| Team | `team.view`: member list and roles | yes | yes | yes |
| Team | `team.inviteStaff`: invite, remove and resend for staff | yes | yes | no |
| Team | `team.manageManagers`: invite, promote, demote and remove managers | yes | no | no |
| Settings | `settings.edit`: profile, branding, contact, legal fields, delivery (P7) | yes | yes | no |
| Settings | `settings.handle`: handle change | yes | no | no |
| Verification | `verification.submit` | yes | no | no |
| Resale (P8) | `resale.manage` | yes | yes | no |
| Activity | `activity.view` | yes | yes | no |
| Closing | `shop.close` | yes | no | no |

Changes to P1 rules this implies:

- `product-variants.cost` field read becomes `costs.view`, so staff no longer receive it.
- Archiving a product needs `catalogue.archive`.
- `POST /api/shops/{id}/handle` becomes owner only.
- `PATCH /api/shops/{id}` needs `settings.edit`.

Every shop route and collection hook calls `requireShopPermission` instead of checking roles inline. `canManageShop` stays as an alias of `can(role, "settings.edit")`.

`resolveShopRole(payload, userId, shopId)` keeps its signature and per-request cache. It now returns `null` when any of these holds:

- the membership is not `active`;
- the member is not the owner and is suspended (`isSuspended`);
- the member is not the owner and the shop is not `active`;
- the member is not the owner and `shopCapabilities(shop).teamMembers` is false (dormant team, see Level drop).

The owner keeps their role on a suspended shop so P1's suspension banner still works. Writes to a non-active shop are refused by the existing `shop.inactive` checks.

### Data model

#### `shop-members` (additions)

| Field | Type | Rules |
|---|---|---|
| `invitation` | relationship shop-invitations | the invitation that created or reactivated the row |
| `joinedAt` | date | |
| `revokedAt` | date | |
| `revokedBy` | relationship users | empty for system revocations |
| `revokedReason` | select `removed`, `left`, `shop_closed`, `account_deleted` | |
| `inboxNotifications` | select `all`, `assigned`, `none` | default `all` for owner and manager, `assigned` for staff; editable by the member themselves |

Read access widens:

- active members of the shop read its `shop-members` rows (`team.view`), without `revokedBy`;
- `inboxNotifications` is readable only by the member and managers.

Writes stay service-only. A revoked row is reactivated (new role, `joinedAt`, cleared revocation fields) when the same user accepts a new invitation; the `(shop, user)` unique index stays.

#### `shop-invitations`

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, required, indexed | |
| `role` | select `manager`, `staff` | |
| `channel` | select `phone`, `email` | |
| `phone` | text | E.164, normalised with the phone-verification normaliser; required when `channel = phone` |
| `email` | text | lowercase, trimmed; required when `channel = email` |
| `tokenHash` | text, unique | SHA-256 of a 32-byte random token (base64url); field `read: () => false` |
| `status` | select `pending`, `accepted`, `declined`, `revoked`, `expired` | service-written |
| `invitedBy` | relationship users, required | |
| `expiresAt` | date | `createdAt + 7 days`. A pending invitation past this date is treated as expired at read time |
| `sendCount` | number | at most 3 sends |
| `lastSentAt` | date | resend at most once per hour |
| `acceptedBy` | relationship users | |
| `respondedAt` | date | |

Rules:

- One `pending` invitation per `(shop, phone)` and per `(shop, email)`: partial unique index on `pendingKey` = `{shopId}:{channel}:{target}`, created by migration.
- Access: read by active members with `team.view`, without `tokenHash`. Create, update and delete closed. Written only by `services/shopMembers.ts`.
- The raw token exists only in the link sent to the invitee. Resending issues a new token and replaces `tokenHash`, so older links stop working.

#### `shop-activity-log`

Append-only: `create`, `update` and `delete` are closed to requests. Only `services/shopActivity.ts` `recordShopActivity(req, entry)` writes, in the same transaction as the change it records.

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, required | compound index `(shop, createdAt)` |
| `actor` | relationship users | empty for system entries |
| `actorRole` | text | snapshot: `owner`, `manager`, `staff`, `system` |
| `action` | select | see below |
| `targetType` | select `shop`, `member`, `invitation`, `product`, `variant`, `listing`, `conversation`, `verification-request` | |
| `targetId` | text, indexed | |
| `metadata` | json | before and after values of changed fields; cost values only on `variant.cost_changed` |
| `createdAt` | date | |

Actions:

- **Team:** `member.invited`, `member.invitation_resent`, `member.invitation_revoked`, `member.joined`, `member.role_changed`, `member.removed`, `member.left`, `member.paused`, `member.resumed`.
- **Catalogue:** `product.created`, `product.updated`, `product.published`, `product.archived`, `variant.price_changed`, `variant.cost_changed`, `stock.moved`, `listing.attached`, `listing.detached`.
- **Shop:** `shop.updated`, `shop.handle_changed`, `shop.closed`.
- **Inbox:** `conversation.assigned`, `conversation.status_changed`.
- **Verification:** `verification.submitted`.

P4 adds order actions.

Read access: active members with `activity.view`. Moderators read it through the P1 moderation shop sheet, which gains a "Team" section (members, roles, joined dates) and the last 20 activity entries. Retention: job `purgeShopActivity`, monthly, deletes entries older than 24 months.

Moderation actions are not duplicated here; `moderation-log` stays their record.

#### `conversations` (additions)

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, indexed | set at creation when the listing has a shop; immutable |
| `buyer` | relationship users, indexed | for shop conversations, the non-shop side; compound index `(shop, buyer)` |
| `assignee` | relationship users | must be an active member with `inbox.reply` |
| `assignedAt` | date | |
| `assignedBy` | relationship users | |
| `inboxStatus` | select `open`, `done` | default `open`; a new buyer message sets `open` |
| `lastMessageAt` | date | set with `lastMessage` |
| `awaitingReply` | checkbox | true when the last message came from the buyer |

For shop conversations, `participants` is always `[buyer, shop.owner]`. Other members reach the conversation through membership, never through `participants`, so revoking a member never has to rewrite conversations.

The `Conversations.beforeChange` hook:

- **On create:**
  - the caller must be in `participants`, otherwise 403 `messages.notParticipant`;
  - if `listing.shop` is set: `shop` = that shop, `buyer` = caller, `participants` = `[caller, shop.owner]`;
  - a member of the shop cannot open a shop conversation with their own shop (`messages.notParticipant`);
  - the shop must be `active` (`shop.inactive`).
- **On update:** `participants`, `shop`, `buyer`, `assignee`, `assignedAt`, `assignedBy`, `inboxStatus` and `awaitingReply` are pinned unless `req.context.inboxService === true`. `lastMessage` and `lastMessageAt` stay writable, as chat-service updates them.

Access:

- **read:** participants, admin and moderator, plus conversations whose `shop` is in the caller's inbox shops. Inbox shops are the shops where `resolveShopRole` returns a role with `inbox.reply`, cached in `req.context.inboxShopIds`.
- **update:** unchanged, plus the pinning above.

#### `messages` (changes)

- **Sender trust:** `sender` from the body is honoured only when `req.user` is the chat-service account (`lib/serviceAccounts.ts` `isChatServiceAccount(user)`: `user.email === process.env.CHAT_SERVICE_EMAIL`). Otherwise `sender = req.user.id`.
- **Membership:** the sender must be a participant, or, for a shop conversation, a member with `inbox.reply`. Otherwise 403 `messages.notParticipant`.
- **Shop state:** a shop conversation whose shop is not `active` refuses new messages from both sides with `shop.inactive`.
- New field `senderSide`, select `buyer` or `shop`, set in `beforeChange` for shop conversations.
- New field `formerMemberAuthor`, checkbox, set by account deletion (see Effects).
- **Read access:** extended the same way as conversations, adding conversations of `req.context.inboxShopIds` to the cached id list.
- **`afterChange`:**
  - buyer messages trigger `shop-inbox-message` to routed members (see Notifications) instead of `new-message`;
  - shop-side messages trigger `new-message` to the buyer, with `senderName` = shop name;
  - it also sets `lastMessageAt`, `awaitingReply` and, for buyer messages, `inboxStatus: open`, with `context.inboxService`.

#### `conversation-reads`

| Field | Type | Rules |
|---|---|---|
| `conversation` | relationship conversations, required | unique compound index `(conversation, user)` |
| `user` | relationship users, required, indexed | |
| `lastReadAt` | date | |
| `lastReadMessage` | relationship messages | |

Access: read by the user themselves; writes service-only.

A member's unread count for a conversation is the number of messages with `createdAt > lastReadAt` and `sender != user`. `messages.read` keeps its meaning for the other side: a buyer message becomes `read` when any member reads it, and a shop message when the buyer reads it. Released clients showing read receipts keep working.

### Services and routes

`services/shopMembers.ts` owns invitations and membership. `services/inbox.ts` owns assignment, status and read state. Both use one Payload transaction per operation, write `shop-activity-log` inside it, and publish chat invalidation after commit.

#### Limits

- `maxMembers` comes from `shopCapabilities(shop)`: 5 at level 2, 20 at level 3, owner included.
- `active members + pending unexpired invitations` must stay below `maxMembers` before an invite, otherwise 409 `team.limitReached`.
- Below level 2 (`teamMembers` false), invite routes return 403 `team.levelRequired`.
- At most 20 invitations sent per shop per day, otherwise `generic.rateLimited`.

#### Team routes

| Route | Permission | Behaviour |
|---|---|---|
| `GET /api/shops/{id}/members` | `team.view` | active members (name, avatar, role, joinedAt), pending invitations with masked target, `maxMembers`, `teamMembers` |
| `POST /api/shops/{id}/invitations` | `team.inviteStaff`, plus `team.manageManagers` for `role: manager` | body `{ channel, phone \| email, role }`; see Invite |
| `POST /api/shops/{id}/invitations/{invId}/resend` | same as invite | new token; `sendCount` ≤ 3, one per hour, else `team.resendLimit` |
| `DELETE /api/shops/{id}/invitations/{invId}` | same as invite | `pending` → `revoked` |
| `PATCH /api/shops/{id}/members/{memberId}` | `team.manageManagers` | body `{ role: manager \| staff }`; the owner row cannot change (`team.cannotManageRole`) |
| `DELETE /api/shops/{id}/members/{memberId}` | `team.inviteStaff` for staff, `team.manageManagers` for managers | see Effects |
| `POST /api/shops/{id}/members/leave` | active member, not owner | `team.ownerCannotLeave` for the owner |
| `PATCH /api/shops/{id}/members/me` | active member | body `{ inboxNotifications }` |
| `GET /api/shops/{id}/activity?actor=&action=&targetType=&cursor=` | `activity.view` | newest first, 50 per page |
| `GET /api/me/shops` | authenticated | shops where the caller has an active role, with role, `capabilities` and inbox unread total; drives the shop switcher |

#### Invite

1. The shop is `active` and `teamMembers` is true; limits hold.
2. Normalise the target:
   - it must not be the caller's own phone or email (`team.cannotInviteSelf`);
   - it must not belong to an active member (`team.alreadyMember`);
   - it must not have a pending invitation (`team.invitationPending`).
3. Create the invitation, write `member.invited`, commit.
4. Deliver:
   - **phone:** SMS through `services/smsProvider.ts`: "{inviter} vous invite à rejoindre {shop} sur BuyNSellem / invites you to join {shop}: https://buynsellem.com/invite/{token}".
   - **email:** Novu `shop-invitation`, email channel. `triggerNotificationEvent` gains an optional `email` so a non-subscriber can be reached through an inline subscriber `invite-{invitationId}`.
   - **Existing account:** if the target matches an existing user (verified phone, or email), that user also gets `shop-invitation` in-app and push.

A delivery failure keeps the invitation and returns `{ delivered: false }`, so the inviter can resend.

#### Accept

| Route | Behaviour |
|---|---|
| `GET /api/public/invitations/{token}` | no auth, rate limited per IP (30 per hour). Returns shop name, logo, handle and badge, role, inviter first name, masked target (`+237 6•• •• •4 21`, `a•••@gmail.com`), `expiresAt`, `status`. An unknown token returns 404 `team.invitationInvalid` |
| `POST /api/invitations/{token}/accept` | authenticated; see below |
| `POST /api/invitations/{token}/decline` | no auth; `pending` → `declined`, notifies the inviter |

Accept, in one transaction:

1. The invitation is `pending` and unexpired, otherwise `team.invitationInvalid`.
2. Identity match:
   - **phone:** the caller has `phoneVerifiedAt` and `users.phone` equals the invited number. A caller without a verified phone gets 403 `team.phoneVerificationRequired`. A different verified number gets `team.invitationMismatch`.
   - **email:** the caller's email equals the invited email, case-insensitive, otherwise `team.invitationMismatch`. Assumption: there is no email verification flow, so the proof is possession of the token that was sent to that address plus control of an account with that email.
3. The caller is not suspended and not already an active member.
4. The shop is still `active`, `teamMembers` is still true, and the limit counted without this invitation still leaves room.
5. Create or reactivate the `shop-members` row; set the invitation to `accepted`; write `member.joined`.
6. After commit:
   - publish chat invalidation for the shop;
   - notify `shop-invitation-accepted` to the inviter and the owner.

Flows by account state:

- **Signed in, matching account:** open link → summary → "Join {shop}" → accept → seller space of that shop.
- **Signed out, existing account:** summary → "Sign in to join" → login with `returnTo=/invite/{token}` → accept.
- **No account:** summary → "Create an account to join" → register, prefilled with the invited email when `channel = email` → return.
  - For `channel = phone`, the invite page starts phone verification with the invited number prefilled (existing `/api/account/phone/start` and `/verify`), then accepts.
- **Signed in with another account:** the mismatch message shows the masked target, with "Switch account".

#### Inbox routes

| Route | Permission | Behaviour |
|---|---|---|
| `POST /api/conversations/start` | authenticated | body `{ listingId }`. Shop listing: returns the conversation for `(listing.shop, caller)`, or creates it. Classic listing: the current find-or-create by participants. Clients switch to this route; the REST create keeps working for released versions |
| `GET /api/shops/{id}/inbox?filter=all\|unassigned\|mine\|unread\|awaiting\|done&q=&cursor=` | `inbox.reply` | conversations sorted by `lastMessageAt`, each with buyer (name, avatar), listing (title, image), last message preview, assignee, `inboxStatus`, `awaitingReply` and the caller's `unreadCount`; totals per filter |
| `POST /api/conversations/{id}/assign` | `inbox.reply` to assign self or unassign self; `inbox.assignOthers` otherwise | body `{ userId \| null }`; the assignee must hold `inbox.reply` (`inbox.notAssignable`); writes `conversation.assigned`; notifies the assignee |
| `POST /api/conversations/{id}/status` | `inbox.reply` | body `{ status: open \| done }`; writes `conversation.status_changed` |
| `POST /api/conversations/{id}/read` | participant or `inbox.reply` | body `{ lastMessageId }`; upserts `conversation-reads` for the caller and sets `messages.read` on the other side's messages up to that message. Also used for classic conversations, which fixes web mark-read. chat-service's `message:read` calls this route under the service token with `{ userId }` |

Released clients that call `GET /api/conversations` keep working. A member who is not a participant also receives shop conversations there; new clients filter their personal list with `where[participants][equals]=me`.

### Effects of membership changes

**Removal or leave** (one transaction):

1. Membership `revoked` with `revokedAt`, `revokedBy` and `revokedReason`.
2. Conversations of the shop assigned to them become unassigned; `conversation.assigned` is written with `metadata.cause: member_removed`.
3. Their `conversation-reads` rows for the shop's conversations are deleted.
4. Pending invitations they sent stay valid. The shop invited, not the person.
5. Listings, products, stock movements and past activity keep them as `actor` for history.
6. After commit:
   - chat invalidation with `removedUserIds`;
   - `shop-member-removed` to the removed user (not on `left`);
   - `member.removed` or `member.left` in the log.

**Listings published by members.** From P3, when a listing has `shop`, `Listings.beforeChange` sets `seller` to `shop.owner`, and the acting member is recorded in `shop-activity-log` (`product.published`). This refines P1's "seller stays the current user". The contact-phone reveal (P0) and the public seller card therefore never expose a staff member's personal account. Removing a member does not orphan the listings they published. Migration: listings with `shop` and `seller != shop.owner` are set to the owner; with owner-only memberships in P1 this should find none.

**Role change:** chat invalidation (the permission set changes), `shop-member-role-changed` to the member, `member.role_changed`. A manager demoted to staff keeps their conversation assignments.

**Member suspended (moderation):**

- The membership row is untouched, and `resolveShopRole` returns `null` while the suspension lasts.
- `suspendUser` and `unsuspendUser` in `services/moderation.ts` publish chat invalidation for every active membership of the user, after commit.
- Their conversation assignments stay, so the owner and managers see a "suspended" chip on the assignee and can reassign.
- Lifting the suspension restores access with no write.

**Shop suspended (P1):**

- Non-owner members lose access through `resolveShopRole`, and chat invalidation is published.
- The inbox refuses new messages from both sides.
- Unsuspension restores access.

**Shop closed (P1 `close`)**, in the close transaction:

- every non-owner membership becomes `revoked` with `shop_closed`;
- pending invitations become `revoked`;
- `member.removed` is written per member, then chat invalidation.

**Level drop (P2 `onShopLevelChanged`)**, when `teamMembers` goes from true to false:

- pending invitations become `revoked`;
- memberships stay `active` but are dormant, since `resolveShopRole` returns `null` for non-owners;
- `member.paused` per member, `shop-team-paused` to members and owner, chat invalidation.

When `teamMembers` returns: `member.resumed`, chat invalidation.

When `maxMembers` shrinks (level 3 → 2) below the active count, no one is removed. New invitations are refused until the count fits, and the team page shows the overage.

**Account deletion** (`deleteUserRelatedData`):

- **Member deletes their account:**
  - memberships `revoked` with `account_deleted`;
  - their messages in shop conversations are kept, with `sender` set to `shop.owner` and `formerMemberAuthor: true`, and shown as "Former member" inside the inbox;
  - they are excluded from the cascade's message deletion.
- **Owner deletes their account:** each owned active shop is closed through `services/shops.ts` close before the existing cascade runs. That applies the closure effects above, then the cascade deletes the shop's conversations as today, because the owner is a participant.
- **Buyer:** unchanged.

### chat-service

`packages/chat-service/src/cache.ts`:

- `getConversationMeta(conversationId)` replaces `getParticipants`. It caches `conv:{id}:meta` = `{ participants, shopId }` for 10 minutes.
- `getInboxMembers(shopId)` caches `shop:{shopId}:inbox-members` for 5 minutes. It is fetched from the new `GET /api/internal/shops/{id}/inbox-members` (chat-service account only, otherwise 403), which returns the user ids for which `resolveShopRole` yields a role with `inbox.reply`, and `[]` for a non-active shop.
- `hasConversationAccess(userId, conversationId)` returns true for participants or, when `shopId` is set, for members of `getInboxMembers(shopId)`. It runs on `conversation:join` and now also at the start of `message:send`; a refusal emits `message:failed` with `error: "Access denied to conversation"`.

Broadcast: `message:new` goes to the conversation room, to `user:{participantId}`, and for shop conversations to `shop-inbox:{shopId}`. The API does not persist per-socket state.

New socket events:

- `shop:inbox:join` `{ shopId }` / `shop:inbox:leave`: the server checks that the user is in `getInboxMembers(shopId)` before joining `shop-inbox:{shopId}`.
- The server emits `inbox:conversation-updated` `{ conversationId, assignee, inboxStatus, awaitingReply, lastMessageAt }` to `shop-inbox:{shopId}` on assignment, status change and new message.
- The server emits `shop:access-revoked` `{ shopId }` to `user:{userId}`.
- On join, the room id is added to the Redis set `shop:{shopId}:rooms`.

Invalidation:

- The API publishes after commit on the Redis channel `chat:membership`, using a publisher shaped like `hooks/searchEvents.ts`: `{ type: "shop.members.changed", shopId, removedUserIds }`.
- **Publishers:** `services/shopMembers.ts` (accept, role change, removal, leave, pause, resume), `services/shops.ts` (close, level change through the listener), `services/moderation.ts` (`suspendShop`, `unsuspendShop`, `suspendUser`, `unsuspendUser`).
- **chat-service subscriber:**
  1. `DEL shop:{shopId}:inbox-members`.
  2. For each removed user id:
     - `io.in("user:{userId}").socketsLeave([...members of shop:{shopId}:rooms, "shop-inbox:{shopId}"])`, which crosses nodes through the Redis adapter;
     - emit `shop:access-revoked`.
  3. When `removedUserIds` is empty (level drop, shop suspension), the subscriber reads `GET /api/internal/shops/{id}/inbox-members` fresh, and every socket in `shop-inbox:{shopId}` whose `userId` is not in it leaves the shop rooms.

`message:read` calls `POST /api/conversations/{id}/read` under the service token instead of patching each message.

### Notifications

New Novu workflows in `syncNotificationWorkflows.ts`:

| Workflow | Recipient | Channels | Trigger |
|---|---|---|---|
| `shop-invitation` | invitee | email (email invites), in-app and push (existing accounts) | invitation created or resent |
| `shop-invitation-accepted` | inviter, owner | in-app, push | accepted |
| `shop-invitation-declined` | inviter | in-app | declined |
| `shop-member-removed` | removed member | in-app, push | removed by owner or manager |
| `shop-member-role-changed` | member | in-app, push | role changed |
| `shop-team-paused` | owner, members | in-app, push, email (owner) | level drop disables the team |
| `shop-inbox-message` | routed members | in-app, push | buyer message in a shop conversation |
| `shop-conversation-assigned` | assignee | in-app, push | assigned by someone else |

Routing for `shop-inbox-message`:

- **Assigned:** the assignee only, unless their preference is `none`.
- **Unassigned:** every member holding `inbox.reply` with preference `all`.
- The sender and suspended members are never notified.
- Throttle: one push per conversation per recipient per 2 minutes, through a Redis key `notif:inbox:{conversationId}:{userId}`.

SMS invitations are sent directly, not through Novu.

### Error codes

Added to `lib/errors.ts`, with fallbacks and translations in both clients:

- `shop.forbidden`
- `team.levelRequired`
- `team.limitReached`
- `team.alreadyMember`
- `team.invitationPending`
- `team.invitationInvalid`
- `team.invitationMismatch`
- `team.phoneVerificationRequired`
- `team.cannotInviteSelf`
- `team.resendLimit`
- `team.ownerCannotLeave`
- `team.cannotManageRole`
- `inbox.notAssignable`
- `messages.notParticipant`

### Web

**New routes:**
- `/invite/[token]`: invitation summary and the account-state flows above; a server-rendered page with `noindex`.
- `/seller/team` (sidebar "Team"):
  - member table (avatar, name, role, joined, actions menu: change role, remove) filtered by the caller's permissions;
  - pending invitations (masked target, role, expiry, resend, revoke);
  - a limit meter "3 / 5";
  - "Invite" button opening a dialog: segmented Phone / Email, phone input with +237 default, role select limited by permission, submit.
  - Below level 2 the page shows a locked state explaining that verified identity unlocks the team, linking to `/seller/verification`.
- `/seller/team/activity`: activity table (when, who, action, target link, details drawer), with filters for member, action and date.
- `/seller/messages` (sidebar "Messages"): shared inbox.
  - Left: filter list with counts (All, Unassigned, Mine, Unread, Awaiting reply, Done).
  - Middle: conversation list (buyer, listing thumbnail, preview, time, assignee avatar, unread dot).
  - Right: thread with a header (buyer, listing link, assignee picker, "Mark done" / "Reopen") and composer.
  - Live updates through `shop-inbox:{shopId}`; on `shop:access-revoked` it redirects to `/seller` with a toast.
- Shop switcher in the seller space header, shown when `GET /api/me/shops` returns more than one shop. The active shop is kept in the `bns_active_shop` cookie.

**Changes to existing screens:**
- Seller sidebar entries are filtered by `can(role, …)`: staff do not see Payments, Verification, Settings or Activity; stock value and cost columns are hidden without `costs.view`.
- `/messages` (personal): a shop conversation where the caller is the owner shows a "Shop" chip and "Open in shop inbox". The list filters on `participants = me`. Mark-read uses `POST /api/conversations/{id}/read`.
- Listing detail "Message" uses `POST /api/conversations/start`.
- The buyer's conversation header shows the shop logo and name for shop conversations. Shop-side messages show the shop name, with the member's first name as secondary text.

### Mobile

**New routes**, registered in `app/_layout.tsx` with `headerShown: false`:
- `app/invite/[token].tsx`: summary, account-state flows (auth modal with `returnTo`, phone verification through `security` with the number prefilled), accept and decline.
- `app/seller/team/index.tsx`: members and pending invitations, limit meter, locked state below level 2.
- `app/seller/team/invite.tsx`: invite sheet (Phone / Email segmented control, phone field with +237 default, role chips, send).
- `app/seller/team/[memberId].tsx`: member detail (role change, remove, joined date, last 10 activity entries for owners and managers).
- `app/seller/activity.tsx`: activity list with filter chips.
- `app/seller/inbox/index.tsx`: shared inbox list with filter chips (All, Unassigned, Mine, Unread, Awaiting, Done), assignee avatars and unread dots.
- `app/seller/inbox/[conversationId].tsx`: the existing conversation screen component with a shop header (buyer, listing), an assignee chip opening an assign sheet (members with `inbox.reply`; staff see only "Assign to me" / "Unassign"), and a "Done" / "Reopen" action.

**Changes to existing screens:**
- Shop hub (`app/seller/index.tsx`):
  - "Team" and "Inbox" tiles, the latter with an unread badge;
  - tiles hidden by permission;
  - a shop switcher in the header when the user belongs to several shops, with the active shop kept in AsyncStorage (`bns.activeShopId`).
- `(tabs)/messages/index.tsx`: filters `participants = me`; owner shop conversations get a "Shop" chip.
- `messages/[conversationId].tsx`: calls the read route on focus; shop header and sender labels as on web.
- `listing/[id].tsx`: "Message" uses `POST /api/conversations/start`.
- Chat client (`src/lib` socket wrapper):
  - joins `shop-inbox:{shopId}` for the active shop;
  - handles `inbox:conversation-updated` by invalidating the inbox query;
  - handles `shop:access-revoked` by leaving the seller screens with an alert.
- Deep link `buynsellem://invite/{token}` resolves through expo-router. The SMS and email links point to the web URL, whose page offers "Open in the app".

### Internationalisation

Every new string in English and French on web (next-intl) and mobile (i18next) in the same change:

- role names and one-line role descriptions;
- permission-driven locked states;
- invitation copy and SMS text (bilingual in one message);
- activity action labels under `shopActivity.actions.*`;
- inbox filters;
- error codes;
- notification copy.

## Testing

**Unit tests:**
- `can`: the full matrix, every role × permission, asserted from one table.
- `resolveShopRole`:
  - active, revoked;
  - suspended non-owner, suspended owner;
  - shop suspended or closed;
  - dormant below level 2;
  - per-request cache.
- Invitations:
  - token hashing (the raw token is never stored);
  - expiry at read time;
  - one pending per target;
  - limit counting with pending invitations;
  - resend limits and the old token invalidated;
  - self-invite and already-member refusals.
- Accept:
  - phone match, missing verified phone, different number;
  - email match case-insensitive, mismatch;
  - reactivation of a revoked row with the new role;
  - limit re-checked at accept;
  - level dropped between invite and accept.
- Removal effects in one transaction: assignments cleared, reads deleted, activity written, invalidation published only after commit.
- Level drop listener: invitations revoked, members dormant, restore on level return.
- Shop close: memberships and invitations revoked.
- Account deletion: member messages re-attributed with `formerMemberAuthor`; owner deletion closes the shop first.
- `Conversations` hook:
  - caller not in participants refused;
  - shop listing sets `shop`, `buyer` and `[buyer, owner]`;
  - pinned fields ignored on REST update.
- `Messages` hook:
  - REST caller cannot forge `sender`;
  - chat-service account can;
  - non-member refused;
  - inactive shop refused;
  - `senderSide` set.
- Read route: per-member unread counts; `messages.read` set for the other side only.
- Notification routing: assigned, unassigned, preferences, suspended member skipped, throttle.
- Activity log: `create`, `update` and `delete` refused through REST; the staff cost field is absent from variant reads.
- Listings: `seller` set to the owner for shop listings.

**chat-service tests** (`bun test`):
- join and send refused for a non-member of a shop conversation, allowed for a member;
- cache invalidation on `chat:membership`;
- `socketsLeave` called with the shop rooms for removed users;
- a refetch-based eviction on an empty `removedUserIds`;
- `message:read` calls the read route.

**Route tests:**
- team routes by role (owner, manager, staff, non-member);
- invite at levels 1, 2 and 3;
- public invitation lookup rate limit;
- accept and decline;
- inbox filters and totals;
- assign rules for staff versus manager;
- `conversations/start` dedupes by `(shop, buyer)`;
- internal inbox-members route refused for non-service callers.

**Clients:**
- Typecheck and biome on web and mobile.
- Manual pass on both with a level-2 staging shop:
  - invite a staff member by phone to a new account (register, verify phone, accept);
  - invite a manager by email to an existing account;
  - staff cannot see costs or payments;
  - a buyer message reaches all members, assignment narrows notifications, a reply shows the shop name to the buyer;
  - remove a member while their inbox screen is open, and confirm the socket is evicted and the screen closes;
  - suspend a member from mobile moderation and confirm loss of access, then restore;
  - revoke the shop's level 2 in P2 and confirm the team pauses.

## Verification targets

- `bun run generate:types` in `packages/api`
- `bun run check-types` in `packages/api`, `packages/web`, `packages/mobile`, `packages/chat-service`
- `bunx vitest run --config ./vitest.config.mts` in `packages/api`
- `bun test` in `packages/mobile` and `packages/chat-service`
- `bunx biome check` on touched files
- Staging: the manual pass above with `shops.enabled` and `verification.enabled` on, two chat-service replicas to exercise cross-node eviction, then production.
