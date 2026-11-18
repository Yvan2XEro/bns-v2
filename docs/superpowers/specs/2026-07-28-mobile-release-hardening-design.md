# Mobile Release Hardening Design

Date: 2026-07-28

## Goal

Harden the mobile and backend surfaces so the current Expo app is less likely to be blocked during Apple App Store and Google Play review.

## Scope

1. Make Expo runtime and native permission configuration explicit.
2. Enforce Sign in with Apple availability rules for mobile social auth exposure.
3. Ensure account deletion removes user-linked data and revokes Apple access when possible.
4. Remove the current non-compliant mobile boost purchase flow from the shippable app surface.

## Design Decisions

### Expo app configuration

- Switch `runtimeVersion.policy` from `appVersion` to `fingerprint` to reduce OTA/runtime drift risk.
- Add explicit config plugins for `expo-image-picker`, `expo-location`, and `expo-notifications`.
- Set `ios.config.usesNonExemptEncryption` to `false`.

### Social auth exposure

- Keep admin-controlled provider toggles.
- Add a backend resolver that normalizes enabled providers.
- If any third-party provider is enabled and Apple is configured, Apple must also be exposed.
- Add an iOS client-side safeguard: if Apple is absent, hide third-party social auth buttons instead of exposing a non-compliant set.

### Account deletion

- Run user cleanup in a `beforeDelete` hook so related hooks can still run while the user document exists.
- Delete related documents explicitly instead of relying on implicit cascades.
- Revoke Apple refresh tokens when they are available.
- Delete Novu subscriber records on best effort.

### Mobile boost flow

- The current mobile boost payment flow relies on external checkout for a digital in-app feature.
- That is not a safe release posture for store review.
- Keep backend boost/payment support intact for web.
- Remove the boost entry point from the mobile listing detail screen.
- Replace the mobile boost screen with a static unavailable state so old deep links do not crash.

## Verification Targets

- `bun run generate:types` in `packages/api`
- `bunx biome check` on touched files
- `bun run check-types` in `packages/api`
