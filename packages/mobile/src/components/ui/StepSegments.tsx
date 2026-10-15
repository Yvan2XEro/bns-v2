import { StyleSheet, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";

/** One bar per step of a multi-step form, filled up to the current one. */
export function StepSegments({
	count,
	current,
}: {
	count: number;
	/** Zero-based. */
	current: number;
}) {
	const c = useShopTheme();
	return (
		<View style={styles.track}>
			{Array.from({ length: count }, (_, index) => (
				<View
					// biome-ignore lint/suspicious/noArrayIndexKey: steps are positional
					key={index}
					style={[
						styles.segment,
						{ backgroundColor: index <= current ? c.primary : c.border },
					]}
				/>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	track: {
		flexDirection: "row",
		gap: 6,
		paddingHorizontal: 16,
		paddingVertical: 6,
	},
	segment: { flex: 1, height: 4, borderRadius: 2 },
});
