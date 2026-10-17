# Error reporting and analytics

Sentry (errors) and PostHog (product analytics) are configured **on the API only**.
No client build carries a key and there is no `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`
variable for them.

## How it fits together

- `GET /api/public/config` returns a `monitoring` block (`packages/api/src/lib/monitoring.ts`):
  the Sentry DSN for each app, the environment, the trace sample rate and the PostHog project key.
- The apps send through the API, not to the vendors directly:
  - `POST /api/relay/errors` is Sentry's tunnel. It forwards only envelopes addressed to one of
    our own DSNs, caps the size at 1 MB, is rate-limited per IP, and keeps the visitor's IP away
    from Sentry.
  - `/api/relay/events/*` is PostHog's reverse proxy. Static files go to the `-assets` host.
  - Ad blockers don't drop either one, because the web reaches them on its own origin.
- **Web:**
  - The SDKs (`@sentry/browser`, `posthog-js`) load as separate chunks once the page is idle.
    Nothing is added to the first paint.
  - Every `error.tsx` reports its error.
  - Server-rendering errors go through `src/instrumentation.ts`.
- **API:** Payload's `afterError` hook (5xx only) and Next's `onRequestError` report to `SENTRY_DSN`.
- **Mobile:**
  - `@sentry/react-native` and `posthog-react-native` start once the config arrives.
  - Screens are tracked by route, and the root `ErrorBoundary` reports.
  - Native crash reporting needs the next native build. Until then the SDK runs in JavaScript only.
- **Funnel events** are shared by both apps (`ANALYTICS_EVENTS` in `contracts/monitoring.ts`):
  `add_to_cart`, `checkout_started`, `order_placed`. Page views and screens are captured on their own.

## Why the keys are not encrypted

A Sentry DSN and a PostHog project key can only **send** events; they can't read anything.
They're designed to ship to browsers and phones. Encrypting them would protect nothing, because
the app would have to carry the key that decrypts them. What protects the projects:

- the relay only forwards to our projects;
- the allowed domains set in Sentry and PostHog;
- the rate limits.

Real secrets never go into this config:

- a Sentry auth token (source-map upload, CI only);
- a PostHog personal API key.

## Privacy choices

- **No cookies, nothing stored on the device:** PostHog runs with `persistence: "memory"`.
  - An anonymous visitor is a new one on each page load or app start.
  - A signed-in user is identified by their account id only.
- **Nothing personal is collected:**
  - `autocapture` and session recording are off;
  - Sentry's `dataCollection` / `sendDefaultPii` collect no headers, cookies, bodies or query strings;
  - the browser's "Do Not Track" signal is respected.
- The privacy policies (web `Privacy.noTracking*`, mobile `privacy.sections.noTracking`) describe exactly this.
  Update them if anything here changes.

## Setup

1. **Sentry:**
   - Create an organization in the **EU region** (`de.sentry.io`).
   - Create three projects: `api` (Node), `web` (Browser JavaScript) and `mobile` (React Native).
   - In each project, under *Settings → Security & Privacy*, turn on **Prevent Storing of IP Addresses**.
   - In the web project, under *Settings → Client Keys → Allowed Domains*, list the site's domains.
2. **PostHog:**
   - Create a project on **EU Cloud**.
   - Under *Project settings*, turn on **Discard client IP data** and fill in **Authorized URLs**.
3. Set these on the API (Dokploy / compose env / `deployments/kubernetes/secret.yaml`):

   ```
   SENTRY_DSN=…            # api project
   SENTRY_WEB_DSN=…        # web project (falls back to SENTRY_DSN)
   SENTRY_MOBILE_DSN=…     # mobile project (falls back to SENTRY_DSN)
   SENTRY_ENVIRONMENT=staging   # or production
   SENTRY_TRACES_SAMPLE_RATE=0  # 0.05 to trace 5% of page loads
   POSTHOG_PROJECT_KEY=phc_…
   POSTHOG_HOST=https://eu.i.posthog.com
   ```

4. Restart the API. The web and the apps pick the change up on their next load, with no rebuild.
5. **Stores:** declare the new data in the store listings:
   - *Diagnostics → Crash data* and *Usage data → Product interaction*;
   - linked to the user;
   - not used for tracking;
   - in App Store Connect's App Privacy and in Google Play's Data safety form.

   No App Tracking Transparency prompt is needed, because nothing is shared across companies for advertising.
