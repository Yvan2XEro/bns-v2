import { type ReactNode, useMemo, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useShopTheme } from "@/src/components/shop/theme";
import { DetailPaneContext } from "@/src/contexts/DetailPaneContext";
import { PaneWidthContext } from "@/src/hooks/useResponsive";
import { paneMotion } from "./paneMotion";

/** The list pane's width beside a detail. */
export const LIST_PANE_WIDTH = 380;

/**
 * A list and the item it opened, side by side. Each pane lays its content
 * out for its own width (`PaneWidthContext`), and the detail pane tells its
 * headers there is nothing to go back to (`DetailPaneContext`). Rendered by
 * `SplitScreen` only when the window is expanded.
 *
 * Motion: the panes fade in when the split appears; when the selection
 * changes, the next item slides in over the previous one fading out
 * (`detailKey` names what the detail shows, so a new item is a new view).
 */
export function SplitLayout({
	list,
	detail,
	detailKey,
	onCloseDetail,
}: {
	list: ReactNode;
	detail: ReactNode;
	detailKey: string;
	/** Empties the detail pane: what "leave this screen" means there. */
	onCloseDetail: () => void;
}) {
	const c = useShopTheme();
	const [width, setWidth] = useState(0);
	const onLayout = (event: LayoutChangeEvent) =>
		setWidth(event.nativeEvent.layout.width);
	const detailWidth = Math.max(0, width - LIST_PANE_WIDTH);
	const pane = useMemo(() => ({ close: onCloseDetail }), [onCloseDetail]);

	return (
		<View style={styles.row} onLayout={onLayout}>
			<Animated.View
				entering={paneMotion.appear}
				style={[
					styles.list,
					{ borderRightColor: c.border, backgroundColor: c.bg },
				]}
			>
				<PaneWidthContext.Provider value={LIST_PANE_WIDTH}>
					{list}
				</PaneWidthContext.Provider>
			</Animated.View>
			<View style={[styles.detail, { backgroundColor: c.bg }]}>
				{/* Drawn once its width is known, so it never lays out twice. */}
				{detailWidth > 0 ? (
					<Animated.View
						key={detailKey}
						entering={paneMotion.enter}
						exiting={paneMotion.exit}
						style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}
					>
						<PaneWidthContext.Provider value={detailWidth}>
							<DetailPaneContext.Provider value={pane}>
								{detail}
							</DetailPaneContext.Provider>
						</PaneWidthContext.Provider>
					</Animated.View>
				) : null}
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
	detail: { flex: 1, overflow: "hidden" },
});
