import { describe, expect, test } from "bun:test";
import { isBrandColor } from "../../../api/src/contracts/shopTheme";
import { brandColorInputSchema, brandColorOf } from "./shop-form";
import {
	BRAND_SWATCHES,
	dominantColor,
	normalizeBrandInput,
	SHOP_THEME_TOKENS,
	shopTheme,
	shopThemeVars,
} from "./shop-theme";

describe("shopThemeVars", () => {
	test("exposes every light tone as --shop-light-* and every dark tone as --shop-dark-*", () => {
		const theme = shopTheme("#0F766E");
		const vars: Record<string, unknown> = { ...shopThemeVars(theme) };
		expect(vars["--shop-light-accent"]).toBe(theme.light.accent);
		expect(vars["--shop-light-on-accent"]).toBe(theme.light.onAccent);
		expect(vars["--shop-light-accent-text"]).toBe(theme.light.accentText);
		expect(vars["--shop-light-accent-soft"]).toBe(theme.light.accentSoft);
		expect(vars["--shop-light-header-bg"]).toBe(theme.light.headerBg);
		expect(vars["--shop-light-header-fg"]).toBe(theme.light.headerFg);
		expect(vars["--shop-light-header-muted"]).toBe(theme.light.headerMuted);
		expect(vars["--shop-dark-accent"]).toBe(theme.dark.accent);
		expect(vars["--shop-dark-header-bg"]).toBe(theme.dark.headerBg);
		expect(Object.keys(vars)).toHaveLength(14);
	});

	test("globals.css resolves every --shop-* from the light set, and from the dark one under .dark", async () => {
		const css = await Bun.file(
			new URL("../app/globals.css", import.meta.url),
		).text();
		for (const token of SHOP_THEME_TOKENS) {
			expect(css).toContain(`--shop-${token}: var(--shop-light-${token});`);
			expect(css).toContain(`--shop-${token}: var(--shop-dark-${token});`);
		}
	});

	test("every value is a plain hex, so nothing a seller types reaches the style", () => {
		const vars = shopThemeVars(shopTheme("#1E40AF;background:url(x)"));
		for (const value of Object.values(vars)) {
			expect(value).toMatch(/^#[0-9A-F]{6}$/);
		}
	});
});

describe("the brand colour as typed in settings", () => {
	test("normalises what the API would accept", () => {
		expect(normalizeBrandInput("0f766e")).toBe("#0F766E");
		expect(normalizeBrandInput(" #b45309 ")).toBe("#B45309");
		expect(normalizeBrandInput("red")).toBeNull();
		expect(normalizeBrandInput("#12345")).toBeNull();
	});

	test("the form refuses exactly what isBrandColor refuses, empty meaning the platform colour", () => {
		for (const typed of [
			"",
			"  ",
			"#1E40AF",
			"1e40af",
			"#GGGGGG",
			"#12",
			"blue",
		]) {
			const sent = brandColorOf(typed);
			const accepted = brandColorInputSchema.safeParse(typed).success;
			expect(accepted).toBe(typed.trim() === "" || sent !== null);
			if (accepted) expect(sent === null || isBrandColor(sent)).toBe(true);
		}
		expect(brandColorOf("")).toBeNull();
	});

	test("the curated swatches are all valid brand colours", () => {
		expect(BRAND_SWATCHES.length).toBeGreaterThanOrEqual(8);
		for (const swatch of BRAND_SWATCHES)
			expect(isBrandColor(swatch)).toBe(true);
	});
});

describe("dominantColor", () => {
	function pixels(...colors: [number, number, number, number, number][]) {
		const out: number[] = [];
		for (const [r, g, b, a, count] of colors) {
			for (let i = 0; i < count; i++) out.push(r, g, b, a);
		}
		return new Uint8ClampedArray(out);
	}

	test("picks the most present colour, ignoring white, black, grey and transparency", () => {
		const color = dominantColor(
			pixels(
				[255, 255, 255, 255, 500],
				[0, 0, 0, 255, 200],
				[128, 128, 128, 255, 200],
				[200, 30, 30, 0, 300],
				[15, 118, 110, 255, 120],
				[180, 83, 9, 255, 40],
			),
		);
		expect(color).toBe("#0F766E");
	});

	test("is null for a logo with no colour in it", () => {
		expect(
			dominantColor(pixels([255, 255, 255, 255, 10], [0, 0, 0, 255, 10])),
		).toBeNull();
	});
});
