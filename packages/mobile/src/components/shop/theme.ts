import { useColorScheme } from "@/hooks/use-color-scheme";

export interface ShopPalette {
	isDark: boolean;
	bg: string;
	header: string;
	card: string;
	input: string;
	text: string;
	body: string;
	muted: string;
	border: string;
	primary: string;
	primarySoft: string;
	sell: string;
	success: string;
	successSoft: string;
	successText: string;
	warningSoft: string;
	warningText: string;
	danger: string;
	dangerSoft: string;
	dangerText: string;
	neutralSoft: string;
	neutralText: string;
}

/** One palette for every shop and seller screen, matching DesignSystem.dc.html. */
export function useShopTheme(): ShopPalette {
	const isDark = useColorScheme() === "dark";
	return {
		isDark,
		bg: isDark ? "#0b1120" : "#f8fafc",
		header: isDark ? "#111827" : "#eef2ff",
		card: isDark ? "#1e293b" : "#ffffff",
		input: isDark ? "#0f172a" : "#f8fafc",
		text: isDark ? "#e2e8f0" : "#0f172a",
		body: isDark ? "#cbd5e1" : "#334155",
		muted: isDark ? "#94a3b8" : "#64748b",
		border: isDark ? "#1e3a5f" : "#e2e8f0",
		primary: isDark ? "#3b82f6" : "#1e40af",
		primarySoft: isDark ? "#172554" : "#dbeafe",
		sell: "#f59e0b",
		success: "#16a34a",
		successSoft: isDark ? "#052e16" : "#dcfce7",
		successText: isDark ? "#86efac" : "#166534",
		warningSoft: isDark ? "#451a03" : "#fef3c7",
		warningText: isDark ? "#fcd34d" : "#92400e",
		danger: "#dc2626",
		dangerSoft: isDark ? "#450a0a" : "#fee2e2",
		dangerText: isDark ? "#fca5a5" : "#991b1b",
		neutralSoft: isDark ? "#1e293b" : "#f1f5f9",
		neutralText: isDark ? "#cbd5e1" : "#475569",
	};
}
