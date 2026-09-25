import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTranslation } from "@/src/lib/i18n";

export type SearchSegmentKey = "listings" | "shops";

/**
 * The Listings/Shops tab bar above the search results, each tab labelled
 * with its live count. Never gated on `shopsEnabled` — that flag controls
 * opening a new shop, not finding an existing one.
 */
export function SearchSegments({
	active,
	onChange,
	listingsCount,
	shopsCount,
}: {
	active: SearchSegmentKey;
	onChange: (segment: SearchSegmentKey) => void;
	listingsCount: number;
	shopsCount: number;
}) {
	const isDark = useColorScheme() === "dark";
	const { t } = useTranslation();
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	return (
		<View style={[styles.segments, { borderBottomColor: borderColor }]}>
			{(["listings", "shops"] as const).map((key) => {
				const isActive = active === key;
				const count = key === "listings" ? listingsCount : shopsCount;
				return (
					<Pressable
						key={key}
						onPress={() => onChange(key)}
						style={[
							styles.segment,
							isActive && { borderBottomColor: primaryColor },
						]}
						accessibilityRole="tab"
						accessibilityState={{ selected: isActive }}
						accessibilityLabel={`${t(`search.segment_${key}`)} ${count.toLocaleString()}`}
					>
						<Text
							style={[
								styles.segmentText,
								{
									color: isActive ? primaryColor : mutedColor,
									fontFamily: Fonts.bodySemibold,
								},
							]}
						>
							{t(`search.segment_${key}`)} {count.toLocaleString()}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	segments: {
		flexDirection: "row",
		borderBottomWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 16,
	},
	segment: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 12,
		minHeight: 44,
		borderBottomWidth: 2,
		borderBottomColor: "transparent",
	},
	segmentText: { fontSize: 14 },
});
