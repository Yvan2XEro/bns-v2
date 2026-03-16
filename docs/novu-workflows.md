# Novu Workflows — BNS

This document describes every workflow to create in the Novu dashboard so that push and in-app notifications work end-to-end with the mobile app.

---

## Prerequisites

| Variable | Where |
|---|---|
| `NOVU_SECRET_KEY` | `packages/api/.env` |
| `EXPO_PUBLIC_NOVU_APP_ID` | `packages/mobile/.env` |

Both are required before any workflow fires.

---

## How the mobile app consumes notifications

The in-app channel is read via `@novu/react-native` (`useNotifications`, `useCounts`).
Each notification has:

- `subject` — bold title line
- `body` — main text
- `tags[]` — drives the icon and color in the notification list
- `redirect.url` — where to navigate on row tap (internal path `/...` or external URL)
- `data` (JSON) — structured payload for navigation fallback and deep links from push

### `data` JSON convention

```json
{ "listingId": "{{listingId}}" }
```

This is read by `item.data?.listingId` in `notifications.tsx` and by the push deep-link handler in `_layout.tsx`.

---

## Channels to enable per workflow

Every workflow below needs **two channels** unless noted:

1. **In-App** — feeds the in-app notification centre
2. **Push (Expo)** — fires when the app is in background / killed

For push, set **Title** = same as In-App subject and **Body** = same as In-App body.
Add the same **Data JSON** so the deep-link handler can navigate on tap.

---

## Workflow templates

### 1. `listing-approved`

**Trigger:** listing status → `published`
**Tags:** `approved`, `published`

| Field | Value |
|---|---|
| Subject | `Annonce publiée` |
| Body | `Votre annonce "{{listingTitle}}" est maintenant en ligne.` |
| Redirect URL | `/listing/{{listingId}}` |
| Data JSON | `{ "listingId": "{{listingId}}" }` |
| Primary action | label: `Voir l'annonce` · redirect: `/listing/{{listingId}}` |

---

### 2. `listing-rejected`

**Trigger:** listing status → `rejected`
**Tags:** `rejected`

| Field | Value |
|---|---|
| Subject | `Annonce refusée` |
| Body | `Votre annonce "{{listingTitle}}" a été refusée. Raison : {{reason}}` |
| Redirect URL | `/listing/{{listingId}}/edit` |
| Data JSON | `{ "listingId": "{{listingId}}" }` |
| Primary action | label: `Modifier l'annonce` · redirect: `/listing/{{listingId}}/edit` |

---

### 3. `listing-status`

**Trigger:** listing status → any other status (draft, pending, sold…)
**Tags:** `published`

| Field | Value |
|---|---|
| Subject | `Mise à jour de votre annonce` |
| Body | `Le statut de "{{listingTitle}}" est passé à {{newStatus}}.` |
| Redirect URL | `/listing/{{listingId}}` |
| Data JSON | `{ "listingId": "{{listingId}}" }` |

---

### 4. `listing-expired`

**Trigger:** scheduled job, daily at midnight
**Tags:** `expired`

| Field | Value |
|---|---|
| Subject | `Annonce expirée` |
| Body | `Votre annonce "{{listingTitle}}" a expiré. Republiez-la pour continuer à vendre.` |
| Redirect URL | `/listing/{{listingId}}` |
| Data JSON | `{ "listingId": "{{listingId}}" }` |
| Primary action | label: `Renouveler` · redirect: `/listing/{{listingId}}` |

---

### 5. `boost-expired`

**Trigger:** scheduled job, daily at midnight
**Tags:** `boost`

| Field | Value |
|---|---|
| Subject | `Boost expiré` |
| Body | `Le boost de "{{listingTitle}}" a expiré. Reboostez pour plus de visibilité.` |
| Redirect URL | `/boost/{{listingId}}` |
| Data JSON | `{ "listingId": "{{listingId}}" }` |
| Primary action | label: `Rebooster` · redirect: `/boost/{{listingId}}` |

---

### 6. `new-message`

**Trigger:** new message created in a conversation
**Tags:** `message`

| Field | Value |
|---|---|
| Subject | `Message de {{senderName}}` |
| Body | `{{messagePreview}}` |
| Redirect URL | `/messages/{{conversationId}}` |
| Data JSON | `{ "conversationId": "{{conversationId}}" }` |
| Primary action | label: `Répondre` · redirect: `/messages/{{conversationId}}` |

---

### 7. `new-review`

**Trigger:** new review created
**Tags:** `review`

| Field | Value |
|---|---|
| Subject | `Nouvel avis de {{reviewerName}}` |
| Body | `{{reviewerName}} vous a laissé {{rating}} ⭐{{#if comment}} : "{{comment}}"{{/if}}` |
| Data JSON | `{}` |

---

### 8. `search-alert`

**Trigger:** scheduled job, every 6 hours
**Tags:** `alert`, `search`

| Field | Value |
|---|---|
| Subject | `{{matchCount}} nouvelle(s) annonce(s) pour "{{searchName}}"` |
| Body | `De nouvelles annonces correspondent à votre alerte "{{searchName}}".` |
| Redirect URL | `{{searchUrl}}` |
| Data JSON | `{}` |
| Primary action | label: `Voir les annonces` · redirect: `{{searchUrl}}` |

> `searchUrl` can be an external URL. The mobile app opens it with `Linking.openURL` when it starts with `http`.

---

### 9. `user-verified`

**Trigger:** user verified field → `true`
**Tags:** `verified`
**Push only** (no in-app needed — user sees it once)

| Field | Value |
|---|---|
| Subject | `Compte vérifié` |
| Body | `Félicitations {{name}} ! Votre compte est maintenant vérifié.` |
| Data JSON | `{}` |

---

### 10. `contact-form`

**Trigger:** public contact form submission
**Subscriber:** `admin` (hardcoded)
**Email channel only** — no in-app, no push.

| Field | Value |
|---|---|
| Subject | `[Contact] {{subject}}` |
| Body | `De : {{name}} ({{email}})\n\n{{message}}` |

---

## Tags → icon mapping (mobile)

The `tags` field drives the icon displayed in the notification list:

| Tag(s) | Icon | Color |
|---|---|---|
| `approved`, `published` | `checkmark-circle-outline` | green |
| `rejected` | `close-circle-outline` | red |
| `message` | `chatbubble-outline` | blue |
| `boost` | `rocket-outline` | amber |
| `alert`, `search` | `bookmark-outline` | purple |
| `sold` | `cash-outline` | green |
| `expired` | `time-outline` | red |
| `verified` | `shield-checkmark-outline` | green |
| `review` | `star-outline` | amber |
| *(fallback)* | `notifications-outline` | blue |

---

## Swipe actions (automatic — no workflow config needed)

The notification list supports swipe-left to reveal:

- **Mark as unread / read** — calls `notification.unread()` / `notification.read()`
- **Archive / Restore** — calls `notification.archive()` / `notification.unarchive()`

---

## Push deep-link navigation

When the user taps a push notification while the app is in background or killed, `_layout.tsx` reads `notification.request.content.data` and navigates:

| `data` field | Navigates to |
|---|---|
| `listingId` | `/listing/{listingId}` |
| `conversationId` | `/messages/{conversationId}` |

This is handled by `PushNotificationHandler` in `_layout.tsx`.
