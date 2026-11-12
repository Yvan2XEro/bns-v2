// ─── Color Palette ────────────────────────────────────────────────────────────
// "Ndop": the indigo of Grassfields resist-dyed cloth carries the shell, and
// the yellow of hand-painted market signage marks the one action that matters.
// Neutrals are tinted from the indigo, never plain grey.

export const Colors = {
	light: {
		// Surfaces
		background: "#f4f5f9",
		foreground: "#12163a",
		card: "#ffffff",
		cardForeground: "#12163a",
		/** Raised field inside a card: inputs, segmented tracks, image wells */
		well: "#eceef5",

		// Brand — ndop indigo, lifted to a brighter blue
		primary: "#2f5bd4",
		primaryForeground: "#ffffff",
		primaryPressed: "#2448ab",
		primaryTint: "#e3e9fb",
		/** Behind a white label: filled buttons, selected chips, ticked boxes */
		primaryFill: "#2f5bd4",
		/** Brand-coloured words on a card: links, selected labels, inline actions */
		link: "#2f5bd4",

		// Signage yellow — sell CTA, price tags, boosted
		sun: "#ffb81c",
		sunForeground: "#12163a",
		sunTint: "#fff1c7",

		// Secondary / Muted
		secondary: "#eceef5",
		secondaryForeground: "#12163a",
		muted: "#eceef5",
		mutedForeground: "#5b6088",
		/** Running text: descriptions, bios, secondary paragraphs */
		body: "#3a3f66",
		faint: "#777ca3",

		// Accent (signage yellow, soft)
		accent: "#fff1c7",
		accentForeground: "#5c3b00",

		// Destructive
		destructive: "#d23a2e",
		destructiveForeground: "#ffffff",

		// Borders & Input
		border: "#e1e3ee",
		borderStrong: "#c9cce0",
		input: "#e1e3ee",
		ring: "#2f5bd4",

		// Convenience aliases used by navigation / tab bars
		text: "#12163a",
		tint: "#2f5bd4",
		icon: "#5b6088",
		tabIconDefault: "#777ca3",
		tabIconSelected: "#2f5bd4",

		// Status colours
		success: "#1e8a4f",
		successTint: "#ddf3e5",
		warning: "#9a6a00",
		warningTint: "#fff1c7",
		info: "#2f43b5",
		dangerTint: "#fbe3e0",
		// Status words: 4.5:1 or better on the card, the ground and the tint.
		// `success`, `warning` and `destructive` are fills; these are for text.
		successText: "#155c35",
		warningText: "#6e4700",
		dangerText: "#8e2219",

		/** Ndop shell: the blue header field and its ink. Kin to `primary`,
		 *  one step down so white sits at 6.9:1 rather than 5.9:1. */
		shell: "#2a51c0",
		shellForeground: "#ffffff",
		shellMuted: "#c7d3f7",

		/** Own chat bubbles, sheet actions, unread badges: white at 8:1, the
		 *  same deep blue in both themes. */
		ownBubble: "#2448ab",
	},
	dark: {
		// Surfaces
		background: "#0c1030",
		foreground: "#e1e3ee",
		card: "#1a1f4a",
		cardForeground: "#e1e3ee",
		well: "#13183e",

		// Brand — the web's blue (#3b82f6, see packages/web globals.css)
		primary: "#3b82f6",
		primaryForeground: "#0c1030",
		primaryPressed: "#7dade9",
		/** A surface, not a text ground: `primary` on it is 3.9:1 — use `link` */
		primaryTint: "#16265c",
		/** White on #3b82f6 is 3.7:1; filled actions step down to 8:1 */
		primaryFill: "#2448ab",
		/** #3b82f6 on a night card is ~4.3:1; words lift to 7:1 */
		link: "#9ec5fe",

		sun: "#ffc94a",
		sunForeground: "#12163a",
		sunTint: "#3a2a00",

		// Secondary / Muted
		secondary: "#1a1f4a",
		secondaryForeground: "#e1e3ee",
		muted: "#1a1f4a",
		mutedForeground: "#a3a7c8",
		body: "#c9cce0",
		faint: "#777ca3",

		// Accent (dark signage)
		accent: "#3a2a00",
		accentForeground: "#fff1c7",

		// Destructive
		destructive: "#e5574b",
		destructiveForeground: "#ffffff",

		// Borders & Input
		border: "#2a3170",
		borderStrong: "#3a4290",
		input: "#2a3170",
		ring: "#3b82f6",

		// Convenience aliases
		text: "#e1e3ee",
		tint: "#3b82f6",
		icon: "#a3a7c8",
		tabIconDefault: "#777ca3",
		tabIconSelected: "#ffc94a",

		// Status colours
		success: "#34b26a",
		successTint: "#0b2a18",
		warning: "#ffc94a",
		warningTint: "#3a2a00",
		info: "#9ec5fe",
		dangerTint: "#3d0f0b",
		successText: "#8fddb0",
		warningText: "#ffd25a",
		dangerText: "#f2a79f",

		shell: "#13183e",
		shellForeground: "#ffffff",
		shellMuted: "#a3a7c8",

		ownBubble: "#2448ab",
	},
} as const;

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = (typeof Colors)[ColorScheme];

// ─── Spacing ──────────────────────────────────────────────────────────────────
// 4-point grid system

export const spacing = {
	px: 1,
	0: 0,
	0.5: 2,
	1: 4,
	1.5: 6,
	2: 8,
	2.5: 10,
	3: 12,
	3.5: 14,
	4: 16,
	5: 20,
	6: 24,
	7: 28,
	8: 32,
	9: 36,
	10: 40,
	12: 48,
	14: 56,
	16: 64,
	20: 80,
	24: 96,
	28: 112,
	32: 128,
} as const;

// ─── Border Radius ────────────────────────────────────────────────────────────

export const borderRadius = {
	none: 0,
	sm: 4,
	md: 8,
	lg: 12,
	xl: 16,
	"2xl": 20,
	"3xl": 24,
	full: 9999,
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────
// Poppins — the display voice: headings, prices, numbers.
// Inter — the working face: body, labels, controls.
// Paired with the web (packages/web/src/app/layout.tsx) — keep the two in sync.

export const Fonts = {
	// Inter — the working face: body, labels, controls.
	body: "Inter_400Regular",
	bodyMedium: "Inter_500Medium",
	bodySemibold: "Inter_600SemiBold",
	bodyBold: "Inter_700Bold",

	// Poppins — the voice: titles, prices, numbers.
	displayMedium: "Poppins_500Medium",
	displaySemibold: "Poppins_600SemiBold",
	displayBold: "Poppins_700Bold",
	displayExtrabold: "Poppins_800ExtraBold",
} as const;

/**
 * Shorthand text-style presets. Spread these in StyleSheet definitions.
 */
export const TextStyles = {
	// ── Roles. Nine steps, each a size the eye can tell from its neighbour;
	// every text style in the app sits on one of them. ──
	/** Tab-root large title: Account, Search, Messages… */
	display: {
		fontFamily: Fonts.displayExtrabold,
		fontSize: 30,
		lineHeight: 38,
		letterSpacing: -0.8,
	},
	/** Screen and sheet title, step headings */
	title: {
		fontFamily: Fonts.displayBold,
		fontSize: 24,
		lineHeight: 32,
		letterSpacing: -0.5,
	},
	/** Section title on a screen */
	section: {
		fontFamily: Fonts.displayBold,
		fontSize: 20,
		lineHeight: 28,
		letterSpacing: -0.4,
	},
	/** Card and group heading, centred stack titles */
	heading: {
		fontFamily: Fonts.displayBold,
		fontSize: 18,
		lineHeight: 26,
		letterSpacing: -0.2,
	},
	/** Emphasised body: row titles, button labels (Bold) */
	strong: { fontFamily: Fonts.bodySemibold, fontSize: 16, lineHeight: 22 },
	/** Running text */
	body: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
	/** Field labels, chips, secondary actions */
	label: { fontFamily: Fonts.bodySemibold, fontSize: 13, lineHeight: 18 },
	/** Metadata: place, time, counts */
	caption: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 16 },
	/** Badges and tab labels */
	micro: { fontFamily: Fonts.bodySemibold, fontSize: 11, lineHeight: 14 },

	// Prices (Poppins)
	price: {
		fontFamily: Fonts.displayExtrabold,
		fontSize: 16,
		lineHeight: 22,
		letterSpacing: -0.3,
	},
	priceLg: {
		fontFamily: Fonts.displayExtrabold,
		fontSize: 30,
		lineHeight: 38,
		letterSpacing: -0.8,
	},

	// Older names, kept for the screens that use them.
	h1: {
		fontFamily: Fonts.displayExtrabold,
		fontSize: 30,
		lineHeight: 38,
		letterSpacing: -0.8,
	},
	h2: {
		fontFamily: Fonts.displayBold,
		fontSize: 24,
		lineHeight: 32,
		letterSpacing: -0.5,
	},
	h3: {
		fontFamily: Fonts.displayBold,
		fontSize: 18,
		lineHeight: 26,
		letterSpacing: -0.2,
	},
	h4: { fontFamily: Fonts.displaySemibold, fontSize: 16, lineHeight: 22 },
	bodyLg: { fontFamily: Fonts.body, fontSize: 16, lineHeight: 22 },
	bodySm: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
	labelLg: { fontFamily: Fonts.bodySemibold, fontSize: 15, lineHeight: 22 },
	labelSm: { fontFamily: Fonts.bodySemibold, fontSize: 12, lineHeight: 16 },
} as const;

export const typography = {
	// Font sizes
	fontSize: {
		xs: 11,
		sm: 13,
		base: 15,
		md: 15,
		lg: 17,
		xl: 20,
		"2xl": 24,
		"3xl": 30,
		"4xl": 36,
	},
	// Line heights
	lineHeight: {
		tight: 1.25,
		snug: 1.375,
		normal: 1.5,
		relaxed: 1.625,
		loose: 2,
	},
	// Font weights (as strings for React Native)
	fontWeight: {
		thin: "100" as const,
		extralight: "200" as const,
		light: "300" as const,
		normal: "400" as const,
		medium: "500" as const,
		semibold: "600" as const,
		bold: "700" as const,
		extrabold: "800" as const,
		black: "900" as const,
	},
	// Letter spacing
	letterSpacing: {
		tighter: -0.8,
		tight: -0.4,
		normal: 0,
		wide: 0.4,
		wider: 0.8,
		widest: 1.6,
	},
} as const;

// ─── Shadows ──────────────────────────────────────────────────────────────────
// React Native shadow properties (iOS) + elevation (Android)

export const shadows = {
	none: {
		shadowColor: "transparent",
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0,
		shadowRadius: 0,
		elevation: 0,
	},
	sm: {
		shadowColor: "#12163a",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 2,
		elevation: 1,
	},
	md: {
		shadowColor: "#12163a",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.08,
		shadowRadius: 6,
		elevation: 3,
	},
	lg: {
		shadowColor: "#12163a",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.12,
		shadowRadius: 12,
		elevation: 6,
	},
	xl: {
		shadowColor: "#12163a",
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 0.16,
		shadowRadius: 20,
		elevation: 10,
	},
	"2xl": {
		shadowColor: "#12163a",
		shadowOffset: { width: 0, height: 16 },
		shadowOpacity: 0.2,
		shadowRadius: 32,
		elevation: 16,
	},
} as const;

// ─── Z-Index ──────────────────────────────────────────────────────────────────

export const zIndex = {
	hide: -1,
	base: 0,
	raised: 10,
	dropdown: 100,
	sticky: 200,
	overlay: 300,
	modal: 400,
	popover: 500,
	toast: 600,
	tooltip: 700,
} as const;

// ─── Spring Presets ───────────────────────────────────────────────────────────
// Reanimated spring configs — import these instead of hardcoding per-component.

export const SpringPresets = {
	gentle: { damping: 20, stiffness: 200, mass: 1 },
	snappy: { damping: 15, stiffness: 400, mass: 0.8 },
	bouncy: { damping: 10, stiffness: 300, mass: 0.8 },
	slow: { damping: 25, stiffness: 120, mass: 1.2 },
	micro: { damping: 18, stiffness: 500, mass: 0.5 },
} as const;

export const ANIMATION_DURATION = {
	fast: 150,
	normal: 250,
	slow: 400,
	slower: 600,
} as const;

// ─── Animation ────────────────────────────────────────────────────────────────

export const animation = {
	duration: {
		fast: 150,
		normal: 250,
		slow: 400,
		slower: 600,
	},
	easing: {
		// Common Bezier presets described as strings for reference
		linear: "linear",
		ease: "ease",
		easeIn: "ease-in",
		easeOut: "ease-out",
		easeInOut: "ease-in-out",
		spring: "spring",
	},
} as const;

// ─── Breakpoints ──────────────────────────────────────────────────────────────

export const breakpoints = {
	sm: 640,
	md: 768,
	lg: 1024,
	xl: 1280,
} as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

export const layout = {
	/** Maximum content width for tablet/web */
	maxContentWidth: 640,
	/** Standard horizontal screen padding */
	screenPaddingH: spacing[4],
	/** Standard vertical screen padding */
	screenPaddingV: spacing[4],
	/** Height of the bottom tab bar */
	tabBarHeight: 60,
	/** Height of the standard header */
	headerHeight: 56,
} as const;

// ─── Convenience theme object ─────────────────────────────────────────────────
// Combines all tokens into one export for easy destructuring.

export const theme = {
	Colors,
	spacing,
	borderRadius,
	typography,
	shadows,
	zIndex,
	animation,
	breakpoints,
	layout,
	Fonts,
} as const;

export default theme;
