import {
	Pressable,
	type StyleProp,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";

export interface Segment<K extends string> {
	key: K;
	label: string;
	/** Shown as a small badge when above zero. */
	count?: number;
}

/** A pill track of equal options with the selected one raised, as in the design system. */
export function SegmentedControl<K extends string>({
	segments,
	value,
	onChange,
	role = "tab",
	disabled,
	style,
}: {
	segments: readonly Segment<K>[];
	value: K;
	onChange: (key: K) => void;
	/** "tab" switches a view; "radio" picks a value in a form. */
	role?: "tab" | "radio";
	disabled?: boolean;
	style?: StyleProp<ViewStyle>;
}) {
	const c = useShopTheme();
	return (
		<View
			style={[styles.track, { backgroundColor: c.neutralSoft }, style]}
			accessibilityRole={role === "tab" ? "tablist" : "radiogroup"}
		>
			{segments.map(({ key, label, count }) => {
				const selected = value === key;
				return (
					<Pressable
						key={key}
						onPress={() => onChange(key)}
						disabled={disabled}
						accessibilityRole={role}
						accessibilityState={
							role === "tab" ? { selected } : { checked: selected }
						}
						accessibilityLabel={count ? `${label} ${count}` : label}
						style={[
							styles.segment,
							selected && [styles.selected, { backgroundColor: c.card }],
						]}
					>
						<Text
							style={[styles.text, { color: selected ? c.primary : c.muted }]}
							numberOfLines={1}
						>
							{label}
						</Text>
						{count ? (
							<View
								style={[
									styles.count,
									{ backgroundColor: selected ? c.primarySoft : c.card },
								]}
							>
								<Text
									style={[
										styles.countText,
										{ color: selected ? c.primary : c.muted },
									]}
								>
									{count}
								</Text>
							</View>
						) : null}
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	track: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 14 },
	segment: {
		flex: 1,
		flexDirection: "row",
		minHeight: 40,
		borderRadius: 11,
		paddingHorizontal: 8,
		gap: 6,
		alignItems: "center",
		justifyContent: "center",
	},
	selected: {
		shadowColor: "#0f172a",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 3,
		elevation: 1,
	},
	text: { fontSize: 14, fontFamily: Fonts.bodySemibold, flexShrink: 1 },
	count: {
		minWidth: 20,
		paddingHorizontal: 6,
		borderRadius: 999,
		alignItems: "center",
	},
	countText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
});
