import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import { isOnline } from "./onlineStatus";

describe("isOnline", () => {
	test("an unprobed network counts as online", () => {
		expect(isOnline({ isConnected: null, isInternetReachable: null })).toBe(
			true,
		);
	});

	test("no connection is offline", () => {
		expect(isOnline({ isConnected: false, isInternetReachable: null })).toBe(
			false,
		);
	});

	test("a connection without internet is offline", () => {
		expect(isOnline({ isConnected: true, isInternetReachable: false })).toBe(
			false,
		);
	});

	test("a reachable connection is online", () => {
		expect(isOnline({ isConnected: true, isInternetReachable: true })).toBe(
			true,
		);
	});

	test("the banner is translated in both locales", () => {
		expect(fr.common.offlineBanner).toBe("Hors ligne");
		expect(typeof en.common.offlineBanner).toBe("string");
	});
});
