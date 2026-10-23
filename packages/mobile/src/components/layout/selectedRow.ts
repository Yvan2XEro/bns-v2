import type { ViewStyle } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";

/**
 * How every list shows the item open in the detail pane beside it: the same
 * accent border and tint, whatever the row looks like otherwise. Returns a
 * function, so a list rendering its rows inline can call it per row.
 */
export function useSelectedRowStyle(): (
	selected: boolean | undefined,
) => ViewStyle | null {
	const c = useShopTheme();
	return (selected) =>
		selected
			? { borderColor: c.primary, backgroundColor: c.primarySoft }
			: null;
}
