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
		bg: isDark ? "#0b1120" : "#f8fafc",
		card: isDark ? "#1e293b" : "#ffffff",
		text: isDark ? "#e2e8f0" : "#0f172a",
		muted: isDark ? "#94a3b8" : "#64748b",
		border: isDark ? "#1e3a5f" : "#e2e8f0",
		primary: isDark ? "#3b82f6" : "#1e40af",
		danger: "#dc2626",
		dangerSoft: isDark ? "#450a0a" : "#fee2e2",
		success: "#16a34a",
		successSoft: isDark ? "#052e16" : "#dcfce7",
		warning: "#d97706",
		warningSoft: isDark ? "#451a03" : "#fef3c7",
		overlay: "rgba(0,0,0,0.5)",
	};
}

/** Narrow view of i18next's `t` used by the moderation screens. */
export type Translate = (
	key: string,
	options?: Record<string, unknown>,
) => string;
