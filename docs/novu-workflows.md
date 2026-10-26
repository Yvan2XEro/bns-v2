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

## Native push: what each side needs

A push reaches a phone only when every link holds:

1. **The app gets a token.** On Android, the build must carry Firebase's
   `google-services.json`; without it, `getExpoPushTokenAsync` fails and the
   app registers nothing (it now reports the failure to Sentry). The file
   stays out of git: create an EAS environment variable `GOOGLE_SERVICES_JSON`
   of type **file** (Firebase console, Project settings, the Android app
   `com.buynsellem.mobile`, download `google-services.json`), for the
   production and preview environments. `app.config.ts` passes it to the
   build; a local build reads a git-ignored `packages/mobile/google-services.json`.
   It is a native change: a new build, not an OTA update.
2. **Expo can send to FCM.** The FCM V1 service account key is uploaded to
   EAS (`eas credentials -p android`, Google Service Account, FCM V1). iOS
   uses the APNs key EAS manages.
3. **The token reaches Novu.** The app posts it to
   `/api/public/novu/register-token` once the permission is granted (asked in
   context: a first message, a first order). The API appends it to the
   subscriber's Expo credentials, so every signed-in device keeps receiving.
4. **Novu sends through Expo.** An active **Expo Push** integration in Novu
   (Integrations, Push, Expo, with an Expo access token);
   `NOVU_EXPO_INTEGRATION_IDENTIFIER` names it when there are several.
5. **The workflow has a push step,** which every synced workflow does.

To check one device: Novu, Subscribers, the account's id, Channels: an Expo
credential with a device token must be listed. None means step 1 or 3
failed; one listed but nothing received means step 2 or 4.

## Self-hosted Novu

Every part of BuyNSellem reads where Novu lives from three variables, read
once by `contracts/novuEndpoints.ts`; nothing else names a Novu host.

| Variable | Read by | Novu Cloud | Self-hosted |
|---|---|---|---|
| `NOVU_API_URL` | API (sends, tokens, workflow sync), web inbox, app inbox via `/api/public/config` | `https://api.novu.co` (or unset) | `https://novu-api.buynsellem.com` |
| `NOVU_SOCKET_URL` | web inbox, app inbox via `/api/public/config` | unset | `https://novu-ws.buynsellem.com` |
| `NOVU_APPLICATION_IDENTIFIER`, `NOVU_SECRET_KEY` | API, web | from Novu Cloud | from your instance's dashboard |

Novu Cloud's address, or nothing, leaves the SDKs on their defaults, so a
Cloud setup needs neither URL. Every docker-compose file, the Kubernetes
configmap and the K3s env catalog (`infra/src/app-env.ts`) pass both URLs to
the API and the web.

**The instance's three services,** one subdomain each, on one level so
Cloudflare's universal certificate covers them, all over HTTPS (iOS refuses
plain HTTP):

| Service | Port | Subdomain |
|---|---|---|
| Dashboard | 4000 | `novu.buynsellem.com` |
| API | 3000 | `novu-api.buynsellem.com` |
| WebSocket | 3002 | `novu-ws.buynsellem.com` (WebSockets allowed at the proxy) |

The instance itself must know these addresses (in its own environment:
`API_ROOT_URL`, `FRONT_BASE_URL`, and the dashboard's API and WebSocket
hostnames, whose names depend on the Novu release).

**Moving from Cloud:** set the three variables above and redeploy the API and
the web. The API recreates every workflow at boot (no plan limit when
self-hosted); recreate the Expo Push integration in the new dashboard; each
app re-registers its device token at sign-in or on its next return to the
foreground. In-app notifications already received on Cloud do not move.
