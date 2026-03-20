# OAuth Setup

This document describes the OAuth configuration expected by the current implementation in this repository.

Current goal:
- add Google, Apple, and Facebook authentication for web, mobile, and admin
- keep classic Payload email/password login enabled during the transition
- verify provider tokens server-side only
- keep Payload as the source of truth for users and sessions

## Overview

The current flow is:

1. web, mobile, or admin triggers a `start` endpoint
2. the OAuth provider redirects back to the backend in `packages/api`
3. the backend verifies the OAuth code server-side
4. the backend finds or creates the Payload user
5. the backend issues a Payload-compatible session
6. the client returns to web, mobile, or admin

The frontend never decides user identity.

## Endpoints Used By The Code

Public API endpoints:

- `GET /api/public/auth/providers`
- `GET /api/public/auth/oauth/:provider/start`
- `GET /api/public/auth/oauth/:provider/callback`
- `POST /api/public/auth/oauth/:provider/callback`
- `POST /api/public/auth/oauth/mobile/exchange`

Currently supported providers:

- `google`
- `apple`
- `facebook`

## Environment Variables

Set these variables in the API `.env` file:

```env
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=

APPLE_OAUTH_CLIENT_ID=
APPLE_OAUTH_TEAM_ID=
APPLE_OAUTH_KEY_ID=
APPLE_OAUTH_PRIVATE_KEY=

FACEBOOK_OAUTH_APP_ID=
FACEBOOK_OAUTH_APP_SECRET=
```

Reference:
- [.env.example](/home/yvan/Workspaces/Projects/bns/bns-repo/.env.example)

## Origins And Redirect URIs

The current code always sends providers back to the backend API.

Example production API origin:

```txt
https://api.buynsellem.com
```

Example local API origin:

```txt
http://localhost:3000
```

Backend redirect URIs to register with providers:

```txt
<API_ORIGIN>/api/public/auth/oauth/google/callback
<API_ORIGIN>/api/public/auth/oauth/apple/callback
<API_ORIGIN>/api/public/auth/oauth/facebook/callback
```

Production example:

```txt
https://api.buynsellem.com/api/public/auth/oauth/google/callback
https://api.buynsellem.com/api/public/auth/oauth/apple/callback
https://api.buynsellem.com/api/public/auth/oauth/facebook/callback
```

Local example:

```txt
http://localhost:3000/api/public/auth/oauth/google/callback
http://localhost:3000/api/public/auth/oauth/facebook/callback
```

Apple should not use plain `localhost` for the web flow. Use an HTTPS tunnel or a real HTTPS domain for local testing.

## Mobile Configuration

Mobile is not registered as a direct redirect URI with providers.

The mobile flow is:

1. the app opens `GET /api/public/auth/oauth/:provider/start?audience=mobile`
2. the provider returns to the backend callback
3. the backend redirects to the mobile deep link
4. the app exchanges a short-lived `transferToken` for a real Payload session

The current Expo scheme is:

```txt
buynsellem://
```

Reference:
- [packages/mobile/app.json](/home/yvan/Workspaces/Projects/bns/bns-repo/packages/mobile/app.json)

The mobile callback expected by the code is:

```txt
buynsellem://auth/callback
```

So there is nothing special to register with providers for mobile. Only the backend redirect URI must be whitelisted.

## Web Configuration

The web app triggers:

```txt
/api/public/auth/oauth/:provider/start?audience=web&redirectTo=...
```

After success:
- the backend creates the `payload-token` cookie
- the user is redirected back to the requested web route

Relevant files:
- [packages/web/src/hooks/use-auth.tsx](/home/yvan/Workspaces/Projects/bns/bns-repo/packages/web/src/hooks/use-auth.tsx)
- [packages/web/src/app/auth/login/page.tsx](/home/yvan/Workspaces/Projects/bns/bns-repo/packages/web/src/app/auth/login/page.tsx)
- [packages/web/src/app/auth/register/page.tsx](/home/yvan/Workspaces/Projects/bns/bns-repo/packages/web/src/app/auth/register/page.tsx)

## Admin Configuration

Payload admin now shows OAuth buttons before the classic login form.

Relevant files:
- [packages/api/src/components/auth/AdminSocialLogin.tsx](/home/yvan/Workspaces/Projects/bns/bns-repo/packages/api/src/components/auth/AdminSocialLogin.tsx)
- [packages/api/src/payload.config.ts](/home/yvan/Workspaces/Projects/bns/bns-repo/packages/api/src/payload.config.ts)

Admin flow:

```txt
/api/public/auth/oauth/:provider/start?audience=admin&redirectTo=/admin
```

Important:
after adding a Payload admin component, regenerate the import map:

```bash
cd packages/api
bun run generate:importmap
```

Otherwise admin can fail with an error like:

```txt
PayloadComponent not found in importMap
```

## Google

### What To Create

In Google Cloud Console:

1. create or select a project
2. configure the OAuth consent screen
3. create an OAuth client of type `Web application`
4. add the backend Google redirect URI under `Authorized redirect URIs`

Values to copy:

- `Client ID` -> `GOOGLE_OAUTH_CLIENT_ID`
- `Client Secret` -> `GOOGLE_OAUTH_CLIENT_SECRET`

Scopes used by the code:

```txt
openid email profile
```

Notes:
- `redirect_uri` must match exactly
- in local development, Google accepts `http://localhost/...`

## Apple

### Important Point

In the current code, `APPLE_OAUTH_CLIENT_ID` must be the web `Services ID`, not the iOS bundle ID.

### What To Create

In Apple Developer:

1. enable `Sign in with Apple` on the main App ID
2. create a `Services ID`
3. configure `Sign in with Apple for the web` on that `Services ID`
4. add the backend domain
5. add the Apple backend return URL
6. create a `Sign in with Apple` key

Values to copy:

- `Services ID Identifier` -> `APPLE_OAUTH_CLIENT_ID`
- `Team ID` -> `APPLE_OAUTH_TEAM_ID`
- `Key ID` -> `APPLE_OAUTH_KEY_ID`
- `.p8` private key contents -> `APPLE_OAUTH_PRIVATE_KEY`

Expected private key format:

```env
APPLE_OAUTH_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

The code automatically converts `\\n` into real line breaks.

### Return URL To Register

```txt
https://api.buynsellem.com/api/public/auth/oauth/apple/callback
```

Or an HTTPS tunnel for local testing.

### Apple Notes

- you need a `Services ID` for the web flow
- you need a dedicated `Sign in with Apple` private key
- Apple may return the user name only on the first consent
- Apple may hide the email address

The current code handles this by creating an internal synthetic email if the provider does not return a usable email.

## Facebook

### What To Create

In Facebook Developers:

1. create an app
2. add the `Facebook Login` product
3. in `Facebook Login > Settings`, add the backend redirect URI
4. copy `App ID` and `App Secret`

Values to copy:

- `App ID` -> `FACEBOOK_OAUTH_APP_ID`
- `App Secret` -> `FACEBOOK_OAUTH_APP_SECRET`

Scope used by the code:

```txt
email,public_profile
```

The code then verifies the token via `debug_token` and fetches the user profile via Graph API.

### Redirect URI To Register

```txt
https://api.buynsellem.com/api/public/auth/oauth/facebook/callback
```

## Variable Mapping To Code

Main files:

- [packages/api/src/auth/oauth/providers.ts](/home/yvan/Workspaces/Projects/bns/bns-repo/packages/api/src/auth/oauth/providers.ts)
- [packages/api/src/auth/oauth/flow.ts](/home/yvan/Workspaces/Projects/bns/bns-repo/packages/api/src/auth/oauth/flow.ts)
- [packages/api/src/auth/oauth/session.ts](/home/yvan/Workspaces/Projects/bns/bns-repo/packages/api/src/auth/oauth/session.ts)
- [packages/api/src/auth/oauth/users.ts](/home/yvan/Workspaces/Projects/bns/bns-repo/packages/api/src/auth/oauth/users.ts)

Current behavior:

- the technical OAuth identity key is `provider + providerAccountId`
- if a user already exists with the same provider/id, it is reused
- otherwise, if the provider returns a verified email matching an existing user, the provider is linked to that user
- otherwise, a new Payload user is created
- sessions remain Payload sessions

## User Model

Fields added to the `users` collection:

- `authProvider`
- `providerAccountId`
- `authProviders`

Reference:
- [packages/api/src/collections/Users.ts](/home/yvan/Workspaces/Projects/bns/bns-repo/packages/api/src/collections/Users.ts)

Important:
- classic login is not removed
- existing accounts continue to work
- migrating the UI to OAuth-only later can happen without removing Payload local auth internals

## Recommended Local Setup

### Google

Works with:

```txt
http://localhost:3000/api/public/auth/oauth/google/callback
```

### Apple

Use an HTTPS tunnel:

```txt
https://<your-tunnel-domain>/api/public/auth/oauth/apple/callback
```

### Facebook

Usually easier with a stable HTTPS dev domain or tunnel.

## Go-Live Checklist

### API

- set all OAuth variables in `.env`
- verify the API is served from the same domain registered with providers
- run `bun run generate:types` if types changed
- run `bun run generate:importmap` if an admin component was added

### Web

- verify web points to the correct API domain
- test Google login
- test Apple login
- test Facebook login

### Mobile

- verify `EXPO_PUBLIC_API_URL` points to the correct API
- verify the Expo scheme is `buynsellem`
- test iOS deep-link return
- test Android deep-link return

### Admin

- test `/admin`
- verify OAuth buttons are visible
- verify an existing admin account can still log in with classic local auth

## Useful Commands

From `packages/api`:

```bash
bun run generate:types
bun run generate:importmap
bun run check-types
```

## Official References

Google:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2/policies

Apple:
- https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web
- https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key
- https://developer.apple.com/documentation/signinwithapplerestapi/request-an-authorization-to-the-sign-in-with-apple-server

Facebook:
- https://developers.facebook.com/docs/facebook-login/

## Current Limitations

- no internal secret rotation documentation yet
- no provider status page in admin yet
- no OAuth-only UI strategy yet
- no phone verification yet

## Recommended Next Step

After provider setup is complete:

1. test each provider on web
2. test each provider on mobile
3. regenerate the admin import map if needed
4. only then simplify the UI toward social-first or OAuth-only
