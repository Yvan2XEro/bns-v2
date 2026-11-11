/**
 * The one palette every illustration draws from.
 *
 * Before this file, the two colour ramps were pasted into all thirteen
 * drawings, so a change to the brand meant thirteen edits and the onboarding
 * slides had quietly drifted onto their own amber. Everything now reads from
 * here, and from `constants/theme.ts` behind it.
 *
 * The light set is the ndop indigo of the shell with signage yellow beside it.
 * The dark set is not the light set inverted: on the near-black #0c1030 ground
 * a pale cardboard face turns into a lamp, so the whole object steps down a
 * few stops and the yellow warms rather than brightens.
 */

import { useColorScheme } from "@/hooks/use-color-scheme";

export type IllustrationPalette = {
	/** Indigo ramp — `deep` is the darkest ink, `lit` the surface facing the lamp. */
	readonly i: {
		readonly deep: string;
		readonly dark: string;
		readonly base: string;
		readonly mid: string;
		readonly light: string;
		readonly pale: string;
		readonly lit: string;
	};
	/** Signage yellow — price tags, tape, the glow inside things. */
	readonly y: {
		readonly deep: string;
		readonly base: string;
		readonly mid: string;
		readonly light: string;
		readonly pale: string;
	};
	/** The ink that strokes an edge, and the white that catches on it. */
	readonly edge: string;
	readonly edgeSoft: string;
	readonly spec: string;
	/** Ground shadow colour, before its radial falloff. */
	readonly shadow: string;
	/** How strongly the ndop weave reads in shade. */
	readonly weave: { readonly strong: number; readonly soft: number };
	readonly isDark: boolean;
};

const LIGHT: IllustrationPalette = {
	i: {
		deep: "#141d58",
		dark: "#1a2672",
		base: "#23338f",
		mid: "#5a64ab",
		light: "#aeb7e2",
		pale: "#e8ebf7",
		lit: "#fdfdff",
	},
	y: {
		deep: "#8a5a00",
		base: "#c98a00",
		mid: "#ffb81c",
		light: "#ffcf5e",
		pale: "#fff1c7",
	},
	edge: "#5a64ab",
	edgeSoft: "#141d58",
	spec: "#ffffff",
	shadow: "#1a2672",
	weave: { strong: 0.15, soft: 0.1 },
	isDark: false,
};

const DARK: IllustrationPalette = {
	i: {
		deep: "#070a24",
		dark: "#0e1442",
		base: "#3d4aa0",
		mid: "#6878ea",
		light: "#8f9ad4",
		pale: "#2b3375",
		lit: "#3e4894",
	},
	y: {
		deep: "#5c3b00",
		base: "#b07c0c",
		mid: "#ffc94a",
		light: "#ffdd8a",
		pale: "#3a2a00",
	},
	edge: "#6878ea",
	edgeSoft: "#070a24",
	// Pure white blows out on the dark ground; the highlight is a cool blue-white.
	spec: "#d8ddf7",
	shadow: "#04061a",
	// The weave needs a little more to survive on a dark side panel.
	weave: { strong: 0.2, soft: 0.13 },
	isDark: true,
};

/** The palette for the current colour scheme. */
export function useIllustrationPalette(): IllustrationPalette {
	return useColorScheme() === "dark" ? DARK : LIGHT;
}

/**
 * Straight access, for the rare caller outside a component. Prefer the hook:
 * it follows the user flipping the system theme, this does not.
 */
export function illustrationPalette(
	scheme: "light" | "dark" | null | undefined,
): IllustrationPalette {
	return scheme === "dark" ? DARK : LIGHT;
}

/**
 * The light comes from the upper left, 35° above the horizon, in every
 * drawing. These are the consequences, so no illustration has to re-derive
 * them and none of them disagree.
 */
export const LIGHT_SOURCE = {
	/** Ground shadows sit this far right of the object that casts them. */
	shadowOffsetX: 7,
	gradient: {
		/** Lit surface: bright at the upper left, falling to the lower right. */
		lit: { x1: "0.1", y1: "0", x2: "0.7", y2: "1" },
		/** Shaded side panel: catches a rim at its outer edge. */
		shade: { x1: "1", y1: "0", x2: "0", y2: "0.6" },
		/** A flap folded back toward the light. */
		flapNear: { x1: "0.2", y1: "1", x2: "0.5", y2: "0" },
		/** A flap folded away from it. */
		flapFar: { x1: "1", y1: "0.8", x2: "0.3", y2: "0" },
	},
} as const;
