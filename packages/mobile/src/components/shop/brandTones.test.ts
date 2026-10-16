import { describe, expect, test } from "bun:test";
import {
	contrast,
	PLATFORM_ACCENT,
	shopTheme,
} from "../../../../api/src/contracts/shopTheme";
import {
	BRAND_SWATCHES,
	brandTones,
	parseBrandColorInput,
	sellerBrandPalette,
} from "./brandTones";

describe("brandTones", () => {
	test("no colour falls back to the platform accent", () => {
		const tones = brandTones(shopTheme(null), "light");
		expect(tones).toEqual({
			...shopTheme(PLATFORM_ACCENT).light,
			statusBarStyle: "light",
		});
	});

	test("picks the tones of the colour scheme", () => {
		const theme = shopTheme("#BE185D");
		expect(brandTones(theme, "light").accent).toBe(theme.light.accent);
		expect(brandTones(theme, "dark").accent).toBe(theme.dark.accent);
	});

	test("status bar content follows the header band text", () => {
		for (const colour of [...BRAND_SWATCHES, "#FDE047", "#FFFFFF"]) {
			const tones = brandTones(shopTheme(colour), "light");
			expect(tones.statusBarStyle).toBe(
				tones.headerFg === "#FFFFFF" ? "light" : "dark",
			);
		}
	});

	test("every curated swatch keeps the header and buttons readable", () => {
		for (const colour of BRAND_SWATCHES) {
			for (const scheme of ["light", "dark"] as const) {
				const t = brandTones(shopTheme(colour), scheme);
				expect(contrast(t.headerBg, t.headerFg)).toBeGreaterThanOrEqual(7);
				expect(contrast(t.accent, t.onAccent)).toBeGreaterThanOrEqual(4.5);
			}
		}
	});
});

describe("parseBrandColorInput", () => {
	test("empty resets to the platform colour", () => {
		expect(parseBrandColorInput("  ")).toEqual({ ok: true, value: null });
	});

	test("normalises case and a missing #", () => {
		expect(parseBrandColorInput("be185d")).toEqual({
			ok: true,
			value: "#BE185D",
		});
	});

	test("refuses what the API refuses", () => {
		for (const bad of ["#FFF", "red", "#12345G", "##123456"]) {
			expect(parseBrandColorInput(bad)).toEqual({ ok: false });
		}
	});
});

describe("sellerBrandPalette", () => {
	test("white text stays readable on the seller primary, whatever the colour", () => {
		for (const color of [...BRAND_SWATCHES, "#FACC15", "#A3E635", "#FFFFFF"]) {
			const theme = shopTheme(color);
			expect(
				contrast(sellerBrandPalette(theme, "light").primary, "#FFFFFF"),
			).toBeGreaterThanOrEqual(4.5);
			expect(
				contrast(sellerBrandPalette(theme, "dark").primary, "#FFFFFF"),
			).toBeGreaterThanOrEqual(3);
		}
	});

	test("the soft fill is the shop's", () => {
		const theme = shopTheme("#15803D");
		expect(sellerBrandPalette(theme, "light").primarySoft).toBe(
			theme.light.accentSoft,
		);
	});
});
