import { useMemo } from "react";
import { useWindowDimensions, type ViewStyle } from "react-native";
import { breakpoints, layout } from "@/constants/theme";

/**
 * Width (in dp) at or above which we consider the surface a "tablet".
 * Matches the web `md` breakpoint so mobile and web stay in sync.
 *
 * NOTE: this is derived from `useWindowDimensions()`, **not**
 * `Dimensions.get("window")`, so it updates on rotation and on
 * iPadOS Stage Manager / Split View resizes.
 */
export const TABLET_BREAKPOINT = breakpoints.md; // 768
export const LARGE_TABLET_BREAKPOINT = breakpoints.lg; // 1024

/** Horizontal padding used by every listing grid on the app. */
const GRID_PADDING_H = 16;
/** Gap between two cards in a listing grid. */
const GRID_GUTTER = 12;

export interface Responsive {
	/** Live window width — updates on rotation / Stage Manager resize. */
	width: number;
	/** Live window height. */
	height: number;
	/** `true` when the window is at least 768dp wide. */
	isTablet: boolean;
	/** `true` when the window is at least 1024dp wide. */
	isLargeTablet: boolean;
	isLandscape: boolean;
	/** Number of columns a listing grid should render. 2 on phones. */
	columns: number;
	/** Width of a single listing card for the current `columns`. */
	cardWidth: number;
	/** Gap between grid cards. */
	gutter: number;
	/**
	 * Max width for reading/form content. Equals the window width on phones
	 * (i.e. a no-op) and is capped on tablets so forms, detail pages and
	 * settings lists don't stretch edge-to-edge on a 13" iPad.
	 */
	contentMaxWidth: number;
	/**
	 * Drop-in style for centring a content column on tablets.
	 * Falsy on phones so `style={[base, centeredContent]}` is strictly
	 * additive and phone rendering is byte-for-byte unchanged.
	 */
	centeredContent: false | ViewStyle;
	/**
	 * Same as `centeredContent` but for modal/dialog surfaces: on tablets a
	 * bottom sheet becomes a centred, width-capped dialog.
	 */
	dialogMaxWidth: number;
}

export function useResponsive(): Responsive {
	const { width, height } = useWindowDimensions();

	return useMemo(() => {
		const isTablet = width >= TABLET_BREAKPOINT;
		const isLargeTablet = width >= LARGE_TABLET_BREAKPOINT;

		// 2 columns on phones (unchanged), 3 on small tablets / split view,
		// 4 once we have a full-width iPad canvas.
		const columns = !isTablet ? 2 : width >= 1180 ? 4 : 3;

		// Phones keep the exact historical formula so nothing shifts by a pixel.
		const cardWidth = isTablet
			? (width - GRID_PADDING_H * 2 - GRID_GUTTER * (columns - 1)) / columns
			: (width - 48) / 2;

		const contentMaxWidth = isTablet
			? Math.min(width, isLargeTablet ? 760 : layout.maxContentWidth)
			: width;

		return {
			width,
			height,
			isTablet,
			isLargeTablet,
			isLandscape: width > height,
			columns,
			cardWidth,
			gutter: GRID_GUTTER,
			contentMaxWidth,
			centeredContent: isTablet
				? { alignSelf: "center", width: "100%", maxWidth: contentMaxWidth }
				: false,
			dialogMaxWidth: isTablet ? 520 : width,
		};
	}, [width, height]);
}

/**
 * Chunk a flat list into rows of `columns` items — used by the listing grids
 * that render rows inside a `FlatList` (instead of `numColumns`, which cannot
 * change at runtime without also changing the list `key`).
 */
export function chunkIntoRows<T>(items: T[], columns: number): T[][] {
	const rows: T[][] = [];
	for (let i = 0; i < items.length; i += columns) {
		rows.push(items.slice(i, i + columns));
	}
	return rows;
}
