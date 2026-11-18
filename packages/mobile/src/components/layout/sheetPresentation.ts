import { useMemo } from "react";
import { useWindowDimensions, type ViewStyle } from "react-native";
import { windowLayout } from "@/src/lib/windowLayout";

export interface SheetPresentation {
	/** The Modal's animation: a sheet slides up, a dialog fades in. */
	animationType: "slide" | "fade";
	/** The full-screen layer that places the panel: bottom edge or centre. */
	wrap: ViewStyle;
	/** Added to the panel's own style: a capped, fully rounded card. */
	panel: ViewStyle | null;
}

const BOTTOM: SheetPresentation = {
	animationType: "slide",
	wrap: { flex: 1, justifyContent: "flex-end" },
	panel: null,
};

/**
 * Where every sheet sits. A phone gets a bottom sheet as designed; a tablet
 * a centred dialog, rather than a strip stretched across the screen. Read
 * from the window, never the pane: a sheet covers the whole window even
 * when it opens from a detail pane.
 */
export function useSheetPresentation(): SheetPresentation {
	const { width, height } = useWindowDimensions();
	return useMemo(() => {
		const layout = windowLayout(width, height);
		if (layout.sheet === "bottom") return BOTTOM;
		return {
			animationType: "fade",
			wrap: {
				flex: 1,
				justifyContent: "center",
				alignItems: "center",
				padding: 24,
			},
			panel: {
				width: "100%",
				maxWidth: layout.dialogMaxWidth,
				maxHeight: "85%",
				borderRadius: 20,
			},
		};
	}, [width, height]);
}
