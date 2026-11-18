import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { useShopTheme } from "@/src/components/shop/theme";

/**
 * The step's one action, pinned under the scroll so it stays in reach
 * whatever the length of what the buyer reads above it.
 */
export function PinnedActionBar({ children }: { children: ReactNode }) {
	const c = useShopTheme();
	const insets = useSafeAreaInsets();
	return (
		<View
			style={[
				styles.bar,
				{
					backgroundColor: c.card,
					borderColor: c.border,
					paddingBottom: 16 + insets.bottom,
				},
			]}
		>
			<ScreenColumn width="reading" style={styles.column}>
				<View style={styles.stack}>{children}</View>
			</ScreenColumn>
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		paddingTop: 12,
		paddingHorizontal: 16,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	column: { flex: 0 },
	stack: { gap: 10 },
});
