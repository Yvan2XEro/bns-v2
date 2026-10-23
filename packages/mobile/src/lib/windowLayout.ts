/**
 * How a screen lays itself out for the width it is given — the window's, or
 * a pane's inside a list/detail split. One pure function, so every screen
 * reads the same answer and a test can pin each threshold.
 * See docs/tablet-ux-2026-10.md.
 */

/**
 * Window size classes, Material's thresholds:
 * - compact: phones — the app exactly as designed for them;
 * - medium: tablets in portrait, wide split screens;
 * - expanded: tablets in landscape.
 */
export type SizeClass = "compact" | "medium" | "expanded";

export const MEDIUM_MIN_WIDTH = 600;
export const EXPANDED_MIN_WIDTH = 840;

/** From this width a grid shows four cards a row. */
const FOUR_COLUMNS_MIN_WIDTH = 1180;
/** Horizontal padding of every listing grid. */
const GRID_PADDING_H = 16;
/** Gap between two cards in a listing grid. */
export const GRID_GUTTER = 12;

/**
 * How wide a column of content may grow:
 * - reading: text, forms, settings;
 * - wide: dashboards and lists with several facts a row;
 * - full: edge to edge (grids, galleries).
 */
export type ColumnWidth = "reading" | "wide" | "full";

const READING_MAX: Record<Exclude<SizeClass, "compact">, number> = {
	medium: 640,
	expanded: 760,
};
const WIDE_MAX = 1120;

/** On a phone a dialog is a sheet as wide as the screen; larger, a card. */
const DIALOG_MAX_WIDTH = 520;

export function sizeClassOf(width: number): SizeClass {
	if (width >= EXPANDED_MIN_WIDTH) return "expanded";
	if (width >= MEDIUM_MIN_WIDTH) return "medium";
	return "compact";
}

/**
 * A phone, judged on the physical screen's short side — not the window, which
 * split screen makes narrow on a tablet too.
 */
export function isPhoneScreen(screen: { width: number; height: number }) {
	return Math.min(screen.width, screen.height) < MEDIUM_MIN_WIDTH;
}

export interface WindowLayout {
	width: number;
	height: number;
	sizeClass: SizeClass;
	/** Medium or expanded: anything wider than a phone. */
	isTablet: boolean;
	/** Expanded: room for a list and its detail side by side. */
	isExpanded: boolean;
	isLandscape: boolean;
	/** Cards a row in a listing grid: 2 on phones. */
	columns: number;
	/** Width of one card for `columns`. */
	cardWidth: number;
	gutter: number;
	/** Max width of a column of `width`: the available width on a phone. */
	columnMaxWidth: (width: ColumnWidth) => number;
	dialogMaxWidth: number;
}

export function windowLayout(width: number, height: number): WindowLayout {
	const sizeClass = sizeClassOf(width);
	const isTablet = sizeClass !== "compact";
	const columns = !isTablet ? 2 : width >= FOUR_COLUMNS_MIN_WIDTH ? 4 : 3;
	return {
		width,
		height,
		sizeClass,
		isTablet,
		isExpanded: sizeClass === "expanded",
		isLandscape: width > height,
		columns,
		// Phones keep the historical formula so nothing shifts by a pixel.
		cardWidth: isTablet
			? (width - GRID_PADDING_H * 2 - GRID_GUTTER * (columns - 1)) / columns
			: (width - 48) / 2,
		gutter: GRID_GUTTER,
		columnMaxWidth: (column) => {
			if (sizeClass === "compact" || column === "full") return width;
			return Math.min(
				width,
				column === "wide" ? WIDE_MAX : READING_MAX[sizeClass],
			);
		},
		dialogMaxWidth: isTablet ? DIALOG_MAX_WIDTH : width,
	};
}

/**
 * Chunk a flat list into rows of `columns` items — for grids rendered as rows
 * inside a list, since `numColumns` cannot change at runtime without
 * remounting the list.
 */
export function chunkIntoRows<T>(items: T[], columns: number): T[][] {
	const rows: T[][] = [];
	for (let i = 0; i < items.length; i += columns) {
		rows.push(items.slice(i, i + columns));
	}
	return rows;
}
