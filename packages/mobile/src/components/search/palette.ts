import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

/**
 * The theme's tokens for the discovery screens (home, search, categories,
 * filters), with `isDark` for the few places that branch on it.
 */
export function useDiscoveryPalette() {
	const isDark = useColorScheme() === "dark";
	return { ...(isDark ? Colors.dark : Colors.light), isDark };
}

export type DiscoveryPalette = ReturnType<typeof useDiscoveryPalette>;
