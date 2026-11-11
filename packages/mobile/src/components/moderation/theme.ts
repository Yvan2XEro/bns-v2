import { useColorScheme } from "@/hooks/use-color-scheme";

export interface ModerationPalette {
	isDark: boolean;
	bg: string;
	card: string;
	text: string;
	muted: string;
	border: string;
	primary: string;
	danger: string;
	dangerSoft: string;
	success: string;
	successSoft: string;
	warning: string;
	warningSoft: string;
	overlay: string;
}

/**
 * The moderation screens share one palette so a decision never looks different
 * depending on which screen it was taken from. Values match the inline
 * light/dark pairs used across the rest of the app.
 */
export function useModerationTheme(): ModerationPalette {
	const isDark = useColorScheme() === "dark";

	return {
		isDark,
		bg: isDark ? "#0c1030" : "#f4f5f9",
		card: isDark ? "#1a1f4a" : "#ffffff",
		text: isDark ? "#e1e3ee" : "#12163a",
		muted: isDark ? "#a3a7c8" : "#5b6088",
		border: isDark ? "#2a3170" : "#e1e3ee",
		primary: isDark ? "#3b82f6" : "#2f5bd4",
		danger: "#d23a2e",
		dangerSoft: isDark ? "#3d0f0b" : "#fbe3e0",
		success: "#1e8a4f",
		successSoft: isDark ? "#0b2a18" : "#ddf3e5",
		warning: "#9a6a00",
		warningSoft: isDark ? "#3a2a00" : "#fff1c7",
		overlay: "rgba(0,0,0,0.5)",
	};
}

/** Narrow view of i18next's `t` used by the moderation screens. */
export type Translate = (
	key: string,
	options?: Record<string, unknown>,
) => string;
