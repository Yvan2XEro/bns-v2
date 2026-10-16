export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "bns.theme";
export const THEME_PREFERENCES: readonly ThemePreference[] = [
	"system",
	"light",
	"dark",
];

export function parseThemePreference(value: unknown): ThemePreference {
	return value === "light" || value === "dark" ? value : "system";
}

/** Whether the page should be dark for this preference and system setting. */
export function isDarkTheme(
	preference: ThemePreference,
	systemDark: boolean,
): boolean {
	return preference === "dark" || (preference === "system" && systemDark);
}

/**
 * Runs in <head> before the first paint, so a dark page never flashes white:
 * the same rule as `isDarkTheme`, written out for a script tag.
 */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
	THEME_STORAGE_KEY,
)});var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
