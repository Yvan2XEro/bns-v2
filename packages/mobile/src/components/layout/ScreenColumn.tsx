import type { ReactNode } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { useResponsive } from "@/src/hooks/useResponsive";
import type { ColumnWidth } from "@/src/lib/windowLayout";

/**
 * The column a screen's content sits in: the whole width on a phone, centred
 * and capped from medium up — `reading` for text and forms, `wide` for
 * dashboards and dense lists, `full` for grids. Wrap a screen's scroll view
 * or list in it, rather than computing a max width by hand.
 */
export function ScreenColumn({
	width = "reading",
	style,
	children,
}: {
	width?: ColumnWidth;
	style?: StyleProp<ViewStyle>;
	children: ReactNode;
}) {
	const { column } = useResponsive();
	return <View style={[styles.fill, column(width), style]}>{children}</View>;
}

const styles = StyleSheet.create({
	fill: { flex: 1 },
});
