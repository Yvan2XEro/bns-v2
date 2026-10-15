// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	contrast,
	isBrandColor,
	PLATFORM_ACCENT,
	shopTheme,
} from "../../src/contracts/shopTheme";

// Colours a seller could plausibly pick, including the hard ones: near-white,
// pure yellow, near-black, a saturated mid green.
const PICKS = [
	"#FFFFFF",
	"#FFFF00",
	"#FDE68A",
	"#000000",
	"#111111",
	"#22C55E",
	"#E11D48",
	"#7C3AED",
	"#0EA5E9",
	"#F59E0B",
	PLATFORM_ACCENT,
];

describe("shopTheme keeps every pair readable whatever the brand colour", () => {
	for (const pick of PICKS) {
		it(`${pick}`, () => {
			const theme = shopTheme(pick);
			for (const [mode, page] of [
				["light", "#F8FAFC"],
				["dark", "#0B1120"],
			] as const) {
				const t = theme[mode];
				expect(contrast(t.accent, t.onAccent)).toBeGreaterThanOrEqual(4.5);
				expect(contrast(t.accentText, page)).toBeGreaterThanOrEqual(4.5);
				expect(contrast(t.headerFg, t.headerBg)).toBeGreaterThanOrEqual(7);
				expect(contrast(t.headerMuted, t.headerBg)).toBeGreaterThanOrEqual(4.5);
				expect(contrast(t.accent, page)).toBeGreaterThanOrEqual(3);
			}
		});
	}
});

describe("brand colour input", () => {
	it("falls back to the platform accent when the shop has none or a bad one", () => {
		expect(shopTheme(null).brandColor).toBe(PLATFORM_ACCENT);
		expect(shopTheme("red").brandColor).toBe(PLATFORM_ACCENT);
		expect(shopTheme("#12345").brandColor).toBe(PLATFORM_ACCENT);
	});

	it("accepts only #RRGGBB", () => {
		expect(isBrandColor("#1e40af")).toBe(true);
		expect(isBrandColor("#1E40AF")).toBe(true);
		expect(isBrandColor("1E40AF")).toBe(false);
		expect(isBrandColor("#FFF")).toBe(false);
		expect(isBrandColor("url(x)")).toBe(false);
	});

	it("keeps a mid-tone brand colour as the accent unchanged", () => {
		expect(shopTheme("#E11D48").light.accent).toBe("#E11D48");
	});
});
