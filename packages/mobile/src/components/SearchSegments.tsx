import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useDiscoveryPalette } from "@/src/components/search/palette";
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
	const c = useDiscoveryPalette();
	const { t, i18n } = useTranslation();

	return (
		<View
			style={[styles.segments, { borderBottomColor: c.border }]}
			accessibilityRole="tablist"
		>
			{(["listings", "shops"] as const).map((key) => {
				const isActive = active === key;
				const count = (
					key === "listings" ? listingsCount : shopsCount
				).toLocaleString(i18n.language);
				return (
					<Pressable
						key={key}
						onPress={() => onChange(key)}
						style={[
							styles.segment,
							isActive && { borderBottomColor: c.primary },
						]}
						accessibilityRole="tab"
						accessibilityState={{ selected: isActive }}
						accessibilityLabel={`${t(`search.segment_${key}`)}, ${count}`}
					>
						<Text
							style={[
								styles.segmentText,
								{ color: isActive ? c.link : c.mutedForeground },
								isActive && styles.segmentTextActive,
							]}
						>
							{t(`search.segment_${key}`)}
						</Text>
						<View
							style={[
								styles.badge,
								{
									backgroundColor: isActive ? c.primaryFill : c.well,
								},
							]}
						>
							<Text
								style={[
									styles.badgeText,
									{ color: isActive ? "#ffffff" : c.mutedForeground },
								]}
							>
								{count}
							</Text>
						</View>
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
		flexDirection: "row",
		gap: 6,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 12,
		minHeight: 48,
		borderBottomWidth: 2,
		borderBottomColor: "transparent",
	},
	segmentText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	segmentTextActive: { fontFamily: Fonts.bodyBold },
	badge: {
		minWidth: 22,
		paddingHorizontal: 7,
		paddingVertical: 1,
		borderRadius: 999,
		alignItems: "center",
	},
	badgeText: {
		fontSize: 12,
		lineHeight: 18,
		fontFamily: Fonts.displaySemibold,
	},
});
