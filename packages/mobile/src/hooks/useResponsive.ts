import { createContext, useContext, useMemo } from "react";
import { useWindowDimensions, type ViewStyle } from "react-native";
import {
	type ColumnWidth,
	chunkIntoRows,
	type WindowLayout,
	windowLayout,
} from "@/src/lib/windowLayout";

export { chunkIntoRows };

/**
 * The width a pane gives its content — set by `SplitLayout` so a screen shown
 * beside a list lays out for its pane, not for the whole window. Absent, the
 * window's width applies.
 */
export const PaneWidthContext = createContext<number | null>(null);

export interface Responsive extends WindowLayout {
	/**
	 * A column of `width`, centred and capped from medium up; `false` on a
	 * phone, so `style={[base, column("reading")]}` changes nothing there.
	 */
	column: (width?: ColumnWidth) => false | ViewStyle;
	/** The reading column: `column("reading")`. */
	centeredContent: false | ViewStyle;
	/** The reading column's max width. */
	contentMaxWidth: number;
}

/**
 * The layout for the space this component is drawn in. Derived from
 * `useWindowDimensions()`, so it follows rotation, split screen and Stage
 * Manager, or from the enclosing pane inside a list/detail split.
 */
export function useResponsive(): Responsive {
	const window = useWindowDimensions();
	const paneWidth = useContext(PaneWidthContext);
	const width = paneWidth ?? window.width;
	const { height } = window;

	return useMemo(() => {
		const layout = windowLayout(width, height);
		const column = (columnWidth: ColumnWidth = "reading"): false | ViewStyle =>
			layout.isTablet
				? {
						alignSelf: "center",
						width: "100%",
						maxWidth: layout.columnMaxWidth(columnWidth),
					}
				: false;
		return {
			...layout,
			column,
			centeredContent: column("reading"),
			contentMaxWidth: layout.columnMaxWidth("reading"),
		};
	}, [width, height]);
}
