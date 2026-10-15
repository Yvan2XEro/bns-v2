/**
 * A shop's brand colour turned into the colours its pages are drawn with, on
 * web and mobile alike. Whatever the seller picks, text stays readable: every
 * pair below is pushed until it clears WCAG AA (4.5:1), or AAA (7:1) for the
 * header, whose text is small and dense.
 *
 * Only the shop's own surfaces take these colours. Buying, payment, trust
 * badges and warnings keep the platform's, so a shop cannot dress itself up
 * as the platform's safety signals.
 */

export const PLATFORM_ACCENT = "#1E40AF";

const HEX = /^#[0-9a-f]{6}$/i;

export function isBrandColor(value: unknown): value is string {
	return typeof value === "string" && HEX.test(value);
}

export interface ShopThemeTones {
	/** Buttons, active tabs, selected chips. */
	accent: string;
	/** Text and icons drawn on `accent`. */
	onAccent: string;
	/** Accent-coloured text and links on the page background. */
	accentText: string;
	/** Selected chip / hover fill behind `accentText`. */
	accentSoft: string;
	/** The shop's header band. */
	headerBg: string;
	/** Text on `headerBg`. */
	headerFg: string;
	/** Secondary text on `headerBg`. */
	headerMuted: string;
}

export interface ShopTheme {
	brandColor: string;
	light: ShopThemeTones;
	dark: ShopThemeTones;
}

const WHITE = "#FFFFFF";
const INK = "#0F172A";
const LIGHT_PAGE = "#F8FAFC";
const DARK_PAGE = "#0B1120";

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
	return `#${[r, g, b]
		.map((c) =>
			Math.round(Math.min(255, Math.max(0, c)))
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")
		.toUpperCase()}`;
}

function mix(a: string, b: string, weightOfB: number): string {
	const x = toRgb(a);
	const y = toRgb(b);
	return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * weightOfB) as Rgb);
}

function luminance(hex: string): number {
	const [r, g, b] = toRgb(hex).map((c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/** `color` moved toward `toward` in small steps until it reads at `ratio` against `against`. */
function untilReadable(
	color: string,
	toward: string,
	against: string,
	ratio: number,
): string {
	for (let step = 0; step <= 20; step++) {
		const candidate = mix(color, toward, step / 20);
		if (contrast(candidate, against) >= ratio) return candidate;
	}
	return toward;
}

function tones(brand: string, page: string, dark: boolean): ShopThemeTones {
	const towardContrast = dark ? WHITE : INK;
	const accent = dark
		? untilReadable(brand, WHITE, page, 3)
		: untilReadable(brand, INK, page, 3);
	const onAccent =
		contrast(accent, WHITE) >= contrast(accent, INK) ? WHITE : INK;
	const accentOk =
		contrast(accent, onAccent) >= 4.5
			? accent
			: untilReadable(accent, onAccent === WHITE ? INK : WHITE, onAccent, 4.5);
	const accentText = untilReadable(brand, towardContrast, page, 4.5);
	const accentSoft = mix(page, brand, dark ? 0.22 : 0.1);
	const headerBg = untilReadable(brand, INK, WHITE, 7);
	return {
		accent: accentOk,
		onAccent,
		accentText,
		accentSoft,
		headerBg,
		headerFg: WHITE,
		headerMuted: untilReadable(mix(headerBg, WHITE, 0.7), WHITE, headerBg, 4.5),
	};
}

/** The theme for a shop, or the platform's own when the shop has not picked a colour. */
export function shopTheme(brandColor: string | null | undefined): ShopTheme {
	const brand = isBrandColor(brandColor)
		? brandColor.toUpperCase()
		: PLATFORM_ACCENT;
	return {
		brandColor: brand,
		light: tones(brand, LIGHT_PAGE, false),
		dark: tones(brand, DARK_PAGE, true),
	};
}
