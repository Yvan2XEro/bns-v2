import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import { useIsDetailPane } from "@/src/contexts/DetailPaneContext";
import { useIsSellerTabRoot } from "@/src/contexts/SellerTabRootContext";
import { useShopTheme } from "./theme";

/**
 * Header shared by every seller screen (hub, catalogue, stock, settings…).
 * Purely presentational: it never fetches or knows what "back" means for a
 * given screen beyond the default stack behaviour, so a screen with its own
 * back semantics (e.g. confirm before leaving an unsaved form) can override
 * `onBack` instead of this component growing a special case per caller.
 */
export function SellerHeader({
	title,
	subtitle,
	onBack,
	right,
	icon = "arrow-back",
}: {
	title: string;
	subtitle?: string | null;
	onBack?: () => void;
	right?: ReactNode;
	icon?: "arrow-back" | "close";
}) {
	const c = useShopTheme();
	// A tab's root and a split's detail pane have nothing to go back to.
	const tabRoot = useIsSellerTabRoot();
	const inPane = useIsDetailPane();
	const noBack = tabRoot || inPane;

	return (
		<View style={[styles.header, { borderBottomColor: c.border }]}>
			{noBack ? (
				<View style={styles.edge} />
			) : (
				<HeaderBackButton
					color={c.text}
					icon={icon}
					onPress={onBack}
					fallback="/(tabs)/account"
				/>
			)}
			<View style={{ flex: 1 }}>
				<Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
					{title}
				</Text>
				{subtitle ? (
					<Text style={[styles.subtitle, { color: c.muted }]} numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
			</View>
			{right ?? <View style={styles.back} />}
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 12,
		paddingVertical: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	back: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	edge: { width: 4 },
	title: { fontSize: 17, fontFamily: Fonts.displayBold },
	subtitle: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
});
