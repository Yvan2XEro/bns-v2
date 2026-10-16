/** The native apps' store identities, as published. */
export const IOS_APP_ID = "6796297640";
export const ANDROID_PACKAGE = "com.buynsellem.mobile";
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
