import { Colors } from "@/constants/theme";
import type { ModerationPalette } from "./theme";

/**
 * Text-safe state colours for the moderation and courier screens.
 *
 * The shared palette's `danger`, `success` and `warning` are fill colours: on
 * the night-indigo card they fall to about 3:1, too faint for a status a
 * moderator acts on. These pairs keep every label at 4.5:1 or better in both
 * themes, on the card, on the ground and on the matching soft tint.
 */
export interface ModerationTones {
	/** Text and icons that say "danger" on a card, the ground or `dangerSoft`. */
	dangerText: string;
	successText: string;
	warningText: string;
	/** Links and selected labels on a card. */
	linkText: string;
	/** Filled buttons carrying a white label. */
	primaryFill: string;
	successFill: string;
	dangerFill: string;
	/** A filled control that cannot be used yet. */
	disabledFill: string;
	disabledText: string;
	/** Soft fill behind a selected option. */
	selectedSoft: string;
	/** Outline of a control that must read as tappable: tiles, switch tracks. */
	strongBorder: string;
	/** Label and icon on any of the fills above. */
	onFill: string;
}

export function moderationTones(isDark: boolean): ModerationTones {
	const k = isDark ? Colors.dark : Colors.light;
	return {
		dangerText: k.dangerText,
		successText: k.successText,
		warningText: k.warningText,
		linkText: k.link,
		primaryFill: k.primaryFill,
		successFill: Colors.light.successText,
		dangerFill: Colors.light.destructive,
		disabledFill: k.border,
		disabledText: k.mutedForeground,
		selectedSoft: k.primaryTint,
		strongBorder: k.borderStrong,
		onFill: Colors.light.primaryForeground,
	};
}

/** Same as {@link moderationTones}, read off a palette already in hand. */
export function tonesOf(c: Pick<ModerationPalette, "isDark">): ModerationTones {
	return moderationTones(c.isDark);
}

export type Tone = "positive" | "negative" | "warning" | "neutral";

/** Text colour and soft background for a status tone. */
export function toneColors(
	tone: Tone,
	c: ModerationPalette,
): { text: string; soft: string } {
	const k = tonesOf(c);
	switch (tone) {
		case "positive":
			return { text: k.successText, soft: c.successSoft };
		case "negative":
			return { text: k.dangerText, soft: c.dangerSoft };
		case "warning":
			return { text: k.warningText, soft: c.warningSoft };
		default:
			return {
				text: c.muted,
				soft: c.isDark ? Colors.dark.well : Colors.light.well,
			};
	}
}
