import { type ReactNode, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { DetailPaneContext } from "@/src/contexts/DetailPaneContext";
import { PaneWidthContext } from "@/src/hooks/useResponsive";

/** The list pane's width beside a detail. */
export const LIST_PANE_WIDTH = 380;

/**
 * A list and the item it opened, side by side. Each pane lays its content
 * out for its own width (`PaneWidthContext`), and the detail pane tells its
 * headers there is nothing to go back to (`DetailPaneContext`). Rendered by
 * `SplitScreen` only when the window is expanded.
 */
export function SplitLayout({
	list,
	detail,
}: {
	list: ReactNode;
	detail: ReactNode;
}) {
	const c = useShopTheme();
	const [width, setWidth] = useState(0);
	const onLayout = (event: LayoutChangeEvent) =>
		setWidth(event.nativeEvent.layout.width);
	const detailWidth = Math.max(0, width - LIST_PANE_WIDTH);

	return (
		<View style={styles.row} onLayout={onLayout}>
			<View
				style={[
					styles.list,
					{ borderRightColor: c.border, backgroundColor: c.bg },
				]}
			>
				<PaneWidthContext.Provider value={LIST_PANE_WIDTH}>
					{list}
				</PaneWidthContext.Provider>
			</View>
			<View style={[styles.detail, { backgroundColor: c.bg }]}>
				<PaneWidthContext.Provider value={detailWidth || null}>
					<DetailPaneContext.Provider value>
						{detail}
					</DetailPaneContext.Provider>
				</PaneWidthContext.Provider>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	row: { flex: 1, flexDirection: "row" },
	list: {
		width: LIST_PANE_WIDTH,
		borderRightWidth: StyleSheet.hairlineWidth,
	},
	detail: { flex: 1 },
});
