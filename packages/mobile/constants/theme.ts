// ─── Color Palette ────────────────────────────────────────────────────────────
// Matches the web globals.css palette exactly.

export const Colors = {
	light: {
		// Surfaces
		background: "#f8fafc",
		foreground: "#0f172a",
		card: "#ffffff",
		cardForeground: "#0f172a",

		// Brand
		primary: "#1e40af",
		primaryForeground: "#ffffff",

		// Secondary / Muted
		secondary: "#f1f5f9",
		secondaryForeground: "#0f172a",
		muted: "#f1f5f9",
		mutedForeground: "#64748b",

		// Accent (amber)
		accent: "#fef3c7",
		accentForeground: "#78350f",

		// Destructive
		destructive: "#dc2626",
		destructiveForeground: "#ffffff",

		// Borders & Input
		border: "#e2e8f0",
		input: "#e2e8f0",
		ring: "#1e40af",

		// Convenience aliases used by navigation / tab bars
		text: "#0f172a",
		tint: "#1e40af",
		icon: "#64748b",
		tabIconDefault: "#64748b",
		tabIconSelected: "#1e40af",

		// Status colours
		success: "#16a34a",
		warning: "#d97706",
		info: "#0ea5e9",
	},
	dark: {
		// Surfaces
		background: "#0b1120",
		foreground: "#e2e8f0",
		card: "#1e293b",
		cardForeground: "#e2e8f0",

		// Brand
		primary: "#3b82f6",
		primaryForeground: "#ffffff",

		// Secondary / Muted
		secondary: "#1e293b",
		secondaryForeground: "#e2e8f0",
		muted: "#1e293b",
		mutedForeground: "#94a3b8",

		// Accent (dark amber)
		accent: "#451a03",
		accentForeground: "#fef3c7",

		// Destructive
		destructive: "#ef4444",
		destructiveForeground: "#ffffff",

		// Borders & Input
		border: "#1e3a5f",
		input: "#1e3a5f",
		ring: "#3b82f6",

		// Convenience aliases
		text: "#e2e8f0",
		tint: "#3b82f6",
		icon: "#94a3b8",
		tabIconDefault: "#94a3b8",
		tabIconSelected: "#3b82f6",

		// Status colours
		success: "#22c55e",
		warning: "#f59e0b",
		info: "#38bdf8",
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
// Matches the web: DM Sans (body) + Outfit (display/headings)

/**
 * Font family names — use these in fontFamily style props.
 * DM Sans  → body text (same as web --font-body)
 * Outfit   → headings, titles, bold labels (same as web --font-display)
 */
export const Fonts = {
	// Body — DM Sans (maps to web's `--font-body: DM Sans`)
	body: "DMSans_400Regular",
	bodyMedium: "DMSans_500Medium",
	bodySemibold: "DMSans_600SemiBold",
	bodyBold: "DMSans_700Bold",

	// Display — Outfit (maps to web's `--font-display: Outfit`)
	displayMedium: "Outfit_500Medium",
	displaySemibold: "Outfit_600SemiBold",
	displayBold: "Outfit_700Bold",
	displayExtrabold: "Outfit_800ExtraBold",
} as const;

/**
 * Shorthand text-style presets mirroring the web design.
 * Import and spread these in StyleSheet definitions.
 */
export const TextStyles = {
	// Headings (Outfit)
	h1: { fontFamily: Fonts.displayExtrabold, fontSize: 28, letterSpacing: -0.5 },
	h2: { fontFamily: Fonts.displayBold, fontSize: 22, letterSpacing: -0.3 },
	h3: { fontFamily: Fonts.displayBold, fontSize: 18 },
	h4: { fontFamily: Fonts.displaySemibold, fontSize: 16 },

	// Body (DM Sans)
	bodyLg: { fontFamily: Fonts.body, fontSize: 17, lineHeight: 26 },
	body: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
	bodySm: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 20 },
	caption: { fontFamily: Fonts.body, fontSize: 11 },

	// Labels (DM Sans Medium/Semibold)
	labelLg: { fontFamily: Fonts.bodySemibold, fontSize: 15 },
	label: { fontFamily: Fonts.bodySemibold, fontSize: 13 },
	labelSm: { fontFamily: Fonts.bodySemibold, fontSize: 11 },

	// Price / highlight (Outfit)
	price: { fontFamily: Fonts.displayBold, fontSize: 16 },
	priceLg: { fontFamily: Fonts.displayExtrabold, fontSize: 26 },
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
		shadowColor: "#0f172a",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 2,
		elevation: 1,
	},
	md: {
		shadowColor: "#0f172a",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.08,
		shadowRadius: 6,
		elevation: 3,
	},
	lg: {
		shadowColor: "#0f172a",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.12,
		shadowRadius: 12,
		elevation: 6,
	},
	xl: {
		shadowColor: "#0f172a",
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 0.16,
		shadowRadius: 20,
		elevation: 10,
	},
	"2xl": {
		shadowColor: "#0f172a",
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
