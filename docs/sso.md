# Single sign-on to the Payload panel

System administrators sign in to `/admin` with their Overbrand account
(Logto, OpenID Connect). It is never offered in the website or the app, and
it never creates an account.

## Who gets in

Both must hold, every time:

1. **At the identity provider:** the person has the role `bunSellemAdmin`
   (`OIDC_REQUIRED_ROLE`), sent in the ID token's `roles` claim (or by the
   userinfo endpoint).
2. **In BuyNSellem:** the account is an administrator and is not suspended.
   Logto proves who the person is; BuyNSellem decides what they may do, so a
   role granted in Logto alone makes no one an administrator.

The first sign-in finds the account by the email Logto marks as verified,
and links the Logto identity (`sub`) to it (`authProviders`, provider
`oidc`); later sign-ins go by that identity, even if the email changes. An
unknown email is refused. Refusals are logged (`[sso] refused` and why).

## Logto

- Application of type **Traditional Web**.
- Redirect URI: `https://api.buynsellem.com/api/public/auth/sso/callback`.
- Post sign-out redirect URI: `https://api.buynsellem.com/admin/login`.
- Scopes `openid profile email roles`; the role `bunSellemAdmin` given only
  to system administrators. Multi-factor authentication is recommended.

## API environment

| Variable | Default |
|---|---|
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | none: the SSO is off without them |
| `OIDC_ISSUER` | `https://auth.overbrand.net/oidc` |
| `OIDC_AUTHORIZATION_ENDPOINT` | `<issuer>/auth` |
| `OIDC_TOKEN_ENDPOINT` | `<issuer>/token` |
| `OIDC_USERINFO_ENDPOINT` | `<issuer>/me` |
| `OIDC_JWKS_URI` | `<issuer>/jwks` |
| `OIDC_REQUIRED_ROLE` | `bunSellemAdmin` |
| `OIDC_SCOPES` | `openid profile email roles` |
| `OIDC_LABEL` | `Overbrand` (the button's wording) |

The callback is built on `PAYLOAD_PUBLIC_SERVER_URL`, so it matches the
redirect URI registered at Logto.

## How it works

`src/auth/sso/`: `config.ts` (the variables), `access.ts` (the claims rule),
`flow.ts` (authorization code with PKCE S256, state and nonce in a short
httpOnly cookie, ID token verified against the provider's JWKS for issuer,
audience and nonce), `users.ts` (the account). Routes:
`/api/public/auth/sso/start` and `/callback`. Tests:
`tests/int/sso.int.spec.ts`.
