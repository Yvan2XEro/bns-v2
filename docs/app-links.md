# Shared links open the app

A link to `https://buynsellem.com/...` (a shop, a listing, a purchase) opens
in the native app when it is installed, and in the browser otherwise. These
are iOS Universal Links and Android App Links.

## What the code does

- **Which pages.** `api/src/contracts/appLinks.ts` lists the pages the app
  opens and maps the few website paths that differ from the app's:
  `/messages?conversation=x` opens `/messages/x`, and `/profile/me` opens
  `/account`.
  - Sign-in, email confirmation, password reset, payment and moderation stay
    on the website.
- **The website.** It publishes, from its environment:
  - `/.well-known/apple-app-site-association`, from `APPLE_TEAM_ID`;
  - `/.well-known/assetlinks.json`, from `ANDROID_SHA256_CERT_FINGERPRINTS`.
  - Without a value, the file answers 404 and links keep opening in the
    browser.
- **The app.** `mobile/app.json` claims `buynsellem.com`
  (`associatedDomains`, and `intentFilters` with `autoVerify`).
  `mobile/app/+native-intent.tsx` lands each link on its screen.
- **The website's banner on a phone.** "Open" takes the same page into the
  app:
  - Android uses an intent link, which falls back to the Play Store;
  - iOS uses `buynsellem://`, then the App Store if nothing opened.
  - Safari shows Apple's banner instead, given the page's address
    (`appArgument`) on listings and shops.

## Turning it on

1. **iOS.** Set `APPLE_TEAM_ID` for the web service: Apple Developer, then
   Membership, then Team ID (ten characters).
2. **Android.** Set `ANDROID_SHA256_CERT_FINGERPRINTS` for the web service:
   - the app signing key, which signs every install from Google Play: Play
     Console, the app, then **Protected with Play**, **Play Store
     distribution**, **Go to Play app signing**, section **App signing key**,
     the SHA-256 value (on older consoles: Test and release, then App
     integrity, then Play app signing);
   - the upload key, which signs the EAS builds installed outside Play:
     `eas credentials -p android`, the production profile, "SHA256
     Fingerprint";
   - both, comma-separated, in uppercase hex with colons.
3. **Redeploy the web, then check both files.** Each must answer 200, as
   JSON, with no redirect:

   ```bash
   curl -si https://buynsellem.com/.well-known/apple-app-site-association | head -5
   curl -si https://buynsellem.com/.well-known/assetlinks.json | head -5
   ```

4. **Build and publish a new app version.** `associatedDomains` and
   `intentFilters` are native settings, so the current store build does not
   have them.
5. **Test, after installing the new build.**
   - Android: `adb shell pm get-app-links com.buynsellem.mobile` must show
     `buynsellem.com: verified`.
   - Then tap a shop link in WhatsApp.

## Limits

- **Only the apex domain** `buynsellem.com` is claimed. Apple and Google do not
  follow a redirect when they fetch the files, so `www.` would need to serve
  them itself before it is added.
- **A local domain such as `buynsellem.lan` cannot use these links.** Apple
  and Google fetch the files from the public internet over a trusted HTTPS
  certificate.
- **Tapping a link inside the website** keeps the reader in the browser. That
  is by design on both systems.
