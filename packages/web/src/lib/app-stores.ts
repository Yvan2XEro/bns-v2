import {
	ANDROID_PACKAGE,
	APP_SCHEME,
	appPathFor,
	opensInApp,
} from "../../../api/src/contracts/appLinks";

export { ANDROID_PACKAGE };

/** The native apps' store identities, as published. */
export const IOS_APP_ID = "6796297640";
export const APP_STORE_URL = `https://apps.apple.com/app/id${IOS_APP_ID}`;
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

export type MobilePlatform = "ios" | "android";

/** The phone or tablet platform a browser runs on, `null` on a computer. */
export function mobilePlatformOf(userAgent: string): MobilePlatform | null {
	if (/android/i.test(userAgent)) return "android";
	if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
	return null;
}

/**
 * Safari on iOS shows Apple's own Smart App Banner from the
 * `apple-itunes-app` meta tag; every other iOS browser (Chrome, Firefox,
 * in-app WebViews) ignores it and needs ours instead.
 */
export function isIosSafari(userAgent: string): boolean {
	return (
		mobilePlatformOf(userAgent) === "ios" &&
		/safari/i.test(userAgent) &&
		!/crios|fxios|edgios|opios|gsa\/|fban|fbav|instagram|line\//i.test(
			userAgent,
		)
	);
}

export function storeUrlFor(platform: MobilePlatform): string {
	return platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
}

/** How long a closed app banner stays closed. */
export const APP_BANNER_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export function bannerSnoozed(
	dismissedAt: number | null,
	now: number,
): boolean {
	return dismissedAt !== null && now - dismissedAt < APP_BANNER_SNOOZE_MS;
}

/** The app's screen for this page, or its home when it has none. */
function appTarget(pathname: string, search: string): string {
	return opensInApp(pathname) ? appPathFor(pathname, search) : "/";
}

/**
 * What "Open in the app" follows, for the page being read.
 *
 * - Android: an intent link — the system opens the app on that screen when it
 *   is installed, and the Play Store otherwise, without a second tap.
 * - iOS: the app's scheme, with the App Store as `fallback` for the page to
 *   go to when nothing took the link (iOS has no intent links).
 */
export function openInAppLink(
	platform: MobilePlatform,
	pathname: string,
	search: string,
): { href: string; fallback: string | null } {
	const target = appTarget(pathname, search);
	if (platform === "android") {
		const fallback = encodeURIComponent(PLAY_STORE_URL);
		return {
			href: `intent://${target.replace(/^\//, "")}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`,
			fallback: null,
		};
	}
	return {
		href: `${APP_SCHEME}://${target.replace(/^\//, "")}`,
		fallback: APP_STORE_URL,
	};
}
