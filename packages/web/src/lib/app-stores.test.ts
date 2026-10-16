import { describe, expect, test } from "bun:test";
import {
	APP_BANNER_SNOOZE_MS,
	bannerSnoozed,
	isIosSafari,
	mobilePlatformOf,
	storeUrlFor,
} from "./app-stores";

const UA = {
	android:
		"Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36",
	iosSafari:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
	iosChrome:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1",
	iosFacebook:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]",
	desktop:
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
};

describe("mobilePlatformOf", () => {
	test("tells Android and iOS apart, and a computer from both", () => {
		expect(mobilePlatformOf(UA.android)).toBe("android");
		expect(mobilePlatformOf(UA.iosSafari)).toBe("ios");
		expect(mobilePlatformOf(UA.desktop)).toBeNull();
	});
});

describe("isIosSafari", () => {
	test("is only Safari itself, which shows Apple's own banner", () => {
		expect(isIosSafari(UA.iosSafari)).toBe(true);
		expect(isIosSafari(UA.iosChrome)).toBe(false);
		expect(isIosSafari(UA.iosFacebook)).toBe(false);
		expect(isIosSafari(UA.android)).toBe(false);
	});
});

describe("store links", () => {
	test("send each platform to its own store", () => {
		expect(storeUrlFor("ios")).toContain("apps.apple.com");
		expect(storeUrlFor("android")).toContain("play.google.com");
	});
});

describe("bannerSnoozed", () => {
	test("keeps a closed banner closed for 30 days, then offers it again", () => {
		const now = Date.now();
		expect(bannerSnoozed(null, now)).toBe(false);
		expect(bannerSnoozed(now - 1000, now)).toBe(true);
		expect(bannerSnoozed(now - APP_BANNER_SNOOZE_MS - 1, now)).toBe(false);
	});
});
