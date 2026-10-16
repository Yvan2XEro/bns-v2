import { describe, expect, test } from "bun:test";
import { isDarkTheme, parseThemePreference, THEME_SCRIPT } from "./theme";

describe("isDarkTheme", () => {
	test("an explicit choice wins over the system", () => {
		expect(isDarkTheme("dark", false)).toBe(true);
		expect(isDarkTheme("light", true)).toBe(false);
	});

	test("with no choice, the page follows the system", () => {
		expect(isDarkTheme("system", true)).toBe(true);
		expect(isDarkTheme("system", false)).toBe(false);
	});
});

describe("parseThemePreference", () => {
	test("anything stored but light or dark means following the system", () => {
		expect(parseThemePreference("dark")).toBe("dark");
		expect(parseThemePreference("light")).toBe("light");
		expect(parseThemePreference(null)).toBe("system");
		expect(parseThemePreference("blue")).toBe("system");
	});
});

describe("THEME_SCRIPT", () => {
	test("is one self-contained statement that cannot throw on a blocked storage", () => {
		expect(THEME_SCRIPT).toStartWith("(function(){try{");
		expect(THEME_SCRIPT).toContain("bns.theme");
	});
});
