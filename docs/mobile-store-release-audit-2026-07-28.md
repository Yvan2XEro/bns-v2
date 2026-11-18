# Mobile Store Release Audit

Date: July 28, 2026

Scope:
- `packages/mobile`
- related runtime/API dependencies in `packages/api`
- Apple App Store / App Store Connect requirements
- Google Play / Play Console requirements
- Expo / EAS production release readiness

## Executive Summary

The current mobile app is not yet safe for production submission on iOS and Android.

There are confirmed high-risk blockers in three categories:

1. Store policy blockers
2. Native configuration blockers
3. Operational / console-side blockers

The most serious confirmed blocker is the current in-app boost payment flow. On mobile, listing boosts are sold through external payment providers (`Stripe` checkout / `NotchPay`) even though the purchased value is a digital in-app advantage. This is very likely to fail both Apple App Review and Google Play review unless replaced with store-compliant native billing for the mobile app.

## Audit Basis

This audit was based on:
- repository inspection
- current Expo / EAS config
- current mobile auth, notifications, payments, privacy, and security flows
- official platform documentation

Primary external references:
- Apple account deletion guidance: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play account deletion requirements: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en
- Google Play payments policy: https://support.google.com/googleplay/android-developer/answer/10281818?hl=en
- Expo permissions guide: https://docs.expo.dev/guides/permissions/
- Expo notifications config: https://docs.expo.dev/versions/v54.0.0/sdk/notifications/
- Expo location config: https://docs.expo.dev/versions/latest/sdk/location/
- Expo image picker config: https://docs.expo.dev/versions/v54.0.0/sdk/imagepicker/
- Expo runtime versions / updates: https://docs.expo.dev/eas-update/runtime-versions/
- Expo SecureStore export compliance note: https://docs.expo.dev/versions/v55.0.0/sdk/securestore/
- Expo push setup: https://docs.expo.dev/push-notifications/push-notifications-setup/

## Current Project State

The mobile app is an Expo managed / EAS-managed app.

Observed files:
- `packages/mobile/app.json`
- `packages/mobile/eas.json`
- `packages/mobile/package.json`

Important current config:
- Expo SDK `54`
- `runtimeVersion.policy = "appVersion"`
- `version = "1.0.0"`
- EAS `production.autoIncrement = true`
- iOS bundle identifier: `com.buynsellem.mobile`
- Android package: `com.buynsellem.mobile`
- social auth providers enabled in product architecture: Google / Apple / Facebook

## Confirmed Blockers

### 1. Mobile Boost Payment Flow Is Not Store-Compliant

Severity: Critical

Observed implementation:
- `packages/mobile/app/boost/[listingId].tsx`
- `packages/mobile/src/contexts/AppConfigContext.tsx`

Current behavior:
- mobile app opens external payment flows for boosts
- providers used: `notchpay` and `stripe`
- purchased item: listing boost shown and consumed inside the app

Why this is a blocker:
- Apple requires in-app purchase for unlocking in-app digital functionality
- Apple explicitly highlights that paying to boost posts/content inside the same app is an in-app purchase case
- Google Play requires Play Billing for digital goods / digital services distributed in the app

Impact:
- iOS review rejection is very likely
- Android review rejection is also likely

Required fix direction:
- keep external payments for web if desired
- replace mobile boost purchase with native store billing:
  - Apple: StoreKit / In-App Purchase
  - Android: Google Play Billing
- backend must map store purchases to boost activation

### 2. Native Permission Configuration Is Incomplete

Severity: Critical

Observed implementation:
- `packages/mobile/app.json`
- app uses:
  - `expo-image-picker`
  - `expo-location`
  - `expo-notifications`

Problem:
- `app.json` does not currently configure these libraries with explicit config plugins and store-review-safe permission messages

Why this matters:
- Expo documents that native permission configuration must be declared at build time
- missing or vague permission messages can cause rejection
- permission behavior may differ between Expo Go and production standalone builds

Specific risks:
- iOS permission texts not tailored to real app usage
- Android unnecessary permissions may be included
- permissions may be broader than required for review

Required fix direction:
- add explicit config plugin entries for:
  - `expo-image-picker`
  - `expo-location`
  - `expo-notifications`
- set permission messages that match actual product behavior
- disable permissions not needed

### 3. `expo-image-picker` Likely Pulls Extra Permission Surface

Severity: High

Observed implementation:
- dependency present in `packages/mobile/package.json`
- picker is used in:
  - listing creation/edit
  - profile avatar editing

Why this matters:
- Expo documents that `expo-image-picker` can add microphone-related permission surface by default on Android unless configured
- the app does not appear to require microphone access for its current feature set

Risk:
- unnecessary sensitive permission in release build
- policy friction during review

Required fix direction:
- configure `expo-image-picker` plugin explicitly
- block microphone permission if not required
- provide exact camera / photo library usage strings

### 4. Push Notifications Are Implemented in JS but Not Fully Hardened in Native Config

Severity: High

Observed implementation:
- `packages/mobile/src/lib/notifications.ts`
- `packages/mobile/app/_layout.tsx`
- token registration is wired
- deep link handling for push is wired

Problem:
- `app.json` does not currently show explicit `expo-notifications` plugin configuration
- store/release credentials and config are not represented in repo

Risks:
- production push may fail if APNs / FCM credentials are not fully configured in Expo/EAS
- Android notification icon / color / default channel are not explicitly configured in native build config
- iOS background remote notification behavior is not explicitly declared if needed later

Required fix direction:
- add `expo-notifications` config plugin in `app.json`
- define at least:
  - Android notification icon
  - Android notification color
  - default channel
- verify APNs + FCM credentials in EAS

### 5. Export Compliance Friction on iOS Is Unresolved

Severity: Medium

Observed implementation:
- `expo-secure-store` is used in `packages/mobile/src/lib/auth.tsx`
- `app.json` does not currently include:
  - `ios.config.usesNonExemptEncryption`

Why this matters:
- Expo documents that this property should be set to avoid App Store Connect export compliance friction for common SecureStore usage

Required fix direction:
- set `ios.config.usesNonExemptEncryption` to `false` if applicable to the shipped app

### 6. OTA Runtime Strategy Is Risky

Severity: High

Observed implementation:
- `packages/mobile/app.json`
- `runtimeVersion.policy = "appVersion"`
- app version is still `1.0.0`
- EAS uses remote app version source and auto-increment for production builds

Why this matters:
- Expo warns that `appVersion` policy depends on version discipline
- if native-affecting changes are shipped without proper app version bump alignment, OTA compatibility can break

Risk:
- production build may accept an incompatible OTA update
- rollback / recovery scenarios become harder

Required fix direction:
- either:
  - enforce strict manual app version bumps for every public native release
- or:
  - switch to `runtimeVersion.policy = "fingerprint"` for safer native/runtime coupling

Recommendation:
- use `fingerprint` unless there is a strong release-process reason not to

### 7. Account Deletion Exists in UI but Backend Data Deletion Scope Is Not Proven

Severity: Critical

Observed implementation:
- mobile UI:
  - `packages/mobile/app/security.tsx`
- account deletion action:
  - `DELETE /api/users/:id`

Why this matters:
- Apple requires in-app account deletion for apps that support account creation
- deletion must remove the account and associated data unless legally retained
- Google Play also requires in-app account deletion and consistent Data deletion declarations

Current concern:
- the UI path exists, which is good
- but the API-side deletion consequences are not visibly hardened for all associated data:
  - listings
  - messages
  - favorites
  - reviews
  - uploads / media
  - saved searches
  - notification subscriber state
  - OAuth provider revocation where applicable

Risk:
- review rejection if deletion is incomplete
- privacy/legal inconsistency
- orphaned data in production

Required fix direction:
- document and implement exact deletion semantics
- cascade or anonymize all relevant dependent data
- ensure user-generated content deletion policy is consistent with terms/privacy
- return user-facing success/failure semantics that match reality

### 8. Sign in with Apple Can Be Disabled by Admin Configuration

Severity: Critical for iOS

Observed implementation:
- `packages/api/src/globals/AppSettings.ts`
- `packages/mobile/src/components/auth/SocialAuthButtons.tsx`
- `packages/api/src/app/(frontend)/api/public/config/route.ts`

Problem:
- the admin can disable Apple while leaving Google and/or Facebook enabled

Why this matters:
- Apple guideline 4.8 requires an equivalent login option when third-party/social login is used for primary account authentication
- if Google/Facebook are enabled on iOS and Apple is disabled, the app can become non-compliant without any mobile code change

Required fix direction:
- on iOS:
  - either always require Apple to be enabled whenever any third-party social login is enabled
  - or hide non-compliant provider combinations from the mobile iOS build
- backend config should enforce this rule, not only frontend UI

### 9. Apple Sign-In Token Revocation on Account Deletion Is Not Evident

Severity: High

Observed implementation:
- Apple OAuth support exists in `packages/api/src/auth/oauth/providers.ts`
- no clear revocation path was identified during this audit

Why this matters:
- Apple’s account deletion guidance calls out revoking Sign in with Apple tokens when users delete accounts

Required fix direction:
- store whatever is needed to revoke Apple tokens correctly
- revoke Apple session/token during account deletion flow when the user linked Apple

### 10. Privacy Screen Content Is Static and Likely Out of Sync With Real Behavior

Severity: High

Observed implementation:
- `packages/mobile/app/privacy.tsx`

Problems:
- static French copy embedded in component
- references are generic and may not match actual data processing
- not obviously aligned with:
  - push token handling
  - phone OTP verification
  - social auth providers
  - media uploads
  - location usage
  - notifications vendor stack

Risk:
- mismatch with App Privacy / Data Safety declarations
- reviewer questions if in-app policy and store disclosures conflict

Required fix direction:
- move policy content to maintained localized copy
- align it with real processing
- ensure the public privacy policy URL used in store metadata matches the app behavior

## Important Operational Risks Outside the Repo

### Apple App Store Connect / Apple Developer

The following items are likely still needed or must be verified:
- App Review contact details
- permanent demo account
- review notes explaining:
  - how to log in
  - how to access social login flows
  - how to trigger boosts
  - how to test deletion
- Sign in with Apple capability enabled for the app
- Push Notifications capability / APNs key configured
- App Privacy answers fully completed
- account deletion behavior consistent with review notes
- privacy policy URL
- terms of service URL
- IAP products for boosts if mobile boost stays in the app

### Google Play Console

The following items are likely still needed or must be verified:
- Data safety form
- Data deletion section
- app access / login credentials for review
- English review instructions
- privacy policy URL
- ads declaration accuracy
- target audience/content declarations
- Play Billing setup for mobile boosts

### Expo / EAS

The following items must be verified:
- APNs key configured for iOS push
- FCM v1 credentials configured for Android push
- EAS production env vars complete
- production build profile tested on real devices
- `ascAppId` may be added to `eas.json` for streamlined submit flow

### OAuth Provider Consoles

The following items must be verified:
- Apple web/service ID and mobile behavior
- Google OAuth production config
- Facebook OAuth production config
- all production redirect URIs
- all required review/demo credentials

## Additional Review Risks

### 1. Login Review Access

Both Apple and Google may reject or delay review if they cannot access the app.

Because the app supports login and social login, review teams need:
- demo credentials
- instructions
- access to any gated flows

Google explicitly requires review access instructions and valid credentials.
Apple requires demo account information when login is required.

### 2. Social Login Policy on iOS

If the mobile app offers Google/Facebook for primary authentication, Apple expects an equivalent login option that meets guideline 4.8 criteria.

This means Sign in with Apple cannot be treated as optional on iOS production.

### 3. Payment Model Messaging

Even after technical payment fixes, metadata must clearly explain what the boost does and how users are charged.

If the business model is unclear, Apple may delay review under payment/business review rules.

### 4. Privacy / Data Disclosure Consistency

Store declarations, in-app privacy screen, and actual code behavior must agree on:
- collected data
- linked data
- tracking
- location use
- push notifications
- account deletion

Any inconsistency here is a real release risk.

## Files Most Relevant to the Release Hardening Work

### Mobile
- `packages/mobile/app.json`
- `packages/mobile/eas.json`
- `packages/mobile/package.json`
- `packages/mobile/app/_layout.tsx`
- `packages/mobile/src/lib/notifications.ts`
- `packages/mobile/src/lib/auth.tsx`
- `packages/mobile/src/lib/api.ts`
- `packages/mobile/app/privacy.tsx`
- `packages/mobile/app/security.tsx`
- `packages/mobile/app/boost/[listingId].tsx`
- `packages/mobile/src/contexts/AppConfigContext.tsx`
- `packages/mobile/src/components/auth/SocialAuthButtons.tsx`

### API
- `packages/api/src/globals/AppSettings.ts`
- `packages/api/src/app/(frontend)/api/public/config/route.ts`
- `packages/api/src/collections/Users.ts`
- `packages/api/src/auth/oauth/providers.ts`

## Recommended Remediation Workstreams

### Workstream 1: Native Config Hardening
- add missing Expo config plugins
- set permission messages
- block unnecessary permissions
- configure notifications plugin
- add iOS encryption compliance flag
- review runtime version strategy

### Workstream 2: Store Policy Compliance
- redesign mobile boost purchase flow to use native store billing
- ensure Sign in with Apple cannot be disabled in a non-compliant iOS configuration
- validate account deletion end-to-end

### Workstream 3: Backend Privacy / Identity Hardening
- define and implement deletion cascade policy
- revoke Apple auth where needed
- verify push token cleanup and provider cleanup

### Workstream 4: Store Metadata / Console Readiness
- App Review / Play review instructions
- demo accounts
- privacy/data safety answers
- deletion declarations
- payment product setup
- push credentials setup

## Recommended Submission Order

1. Fix repo-level blockers first
2. Test production-like EAS builds on physical iPhone and Android devices
3. Verify social login, deletion, push, payments, image upload, location, OTP flows
4. Complete App Store Connect and Play Console declarations
5. Submit internal/beta testing builds
6. Only then submit for external review

## Final Assessment

Status as of July 28, 2026:
- Not ready for iOS App Store submission
- Not ready for Google Play production submission

Top blockers to fix first:
1. Mobile boost billing flow
2. Expo native permission/plugin configuration
3. Account deletion backend completeness
4. iOS Sign in with Apple compliance enforcement
5. Push credentials/config verification
6. Privacy/data safety/store declaration alignment

## Suggested Next Step

Create a release-hardening implementation plan that:
- patches the repo
- defines console-side setup tasks
- ends with a full submission checklist for both Apple and Google
