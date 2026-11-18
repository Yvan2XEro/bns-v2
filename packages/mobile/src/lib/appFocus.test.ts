import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
	AppState: { addEventListener: () => ({ remove: () => {} }) },
	Platform: { OS: "android" },
}));

const { isAppFocused } = await import("./appFocus");

describe("isAppFocused", () => {
	test("only the foreground counts", () => {
		expect(isAppFocused("active")).toBe(true);
		expect(isAppFocused("background")).toBe(false);
		expect(isAppFocused("inactive")).toBe(false);
	});
});
