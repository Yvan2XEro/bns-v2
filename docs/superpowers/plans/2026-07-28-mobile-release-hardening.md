# Mobile Release Hardening Plan

Date: 2026-07-28

1. Update `packages/mobile/app.json` with explicit native plugin and runtime settings.
2. Add a shared backend resolver for enabled OAuth providers and use it in public config/auth routes.
3. Add an iOS-side social auth guard in `packages/mobile/src/components/auth/SocialAuthButtons.tsx`.
4. Persist Apple refresh tokens in OAuth user links and revoke them during account deletion.
5. Add user account cleanup service and wire it into `packages/api/src/collections/Users.ts`.
6. Neutralize the mobile boost purchase UI and remove the listing-detail CTA.
7. Run generation, type checks, and Biome validation.
