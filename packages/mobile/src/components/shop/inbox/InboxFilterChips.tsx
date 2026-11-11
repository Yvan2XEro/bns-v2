import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { useTranslation } from "@/src/lib/i18n";
import { INBOX_FILTERS, type InboxFilter } from "@/src/types/api";
import { useShopTheme } from "../theme";

/** The six inbox filters, each with its own server-computed total — never a client-side count of the current page. */
export function InboxFilterChips({
	active,
	totals,
	onChange,
}: {
	active: InboxFilter;
	totals: Record<InboxFilter, number> | undefined;
	onChange: (filter: InboxFilter) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	// A selected chip sits on the contrast-safe fill with a white label, as
	// the buyer inbox's filters do.
	const onSelected = "#ffffff";

	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			style={styles.scroll}
			contentContainerStyle={styles.row}
		>
			{INBOX_FILTERS.map((filter) => {
				const selected = filter === active;
				const count = totals?.[filter];
				return (
					<AnimatedPressable
						key={filter}
						onPress={() => onChange(filter)}
						animationType="scale"
						haptic="light"
						accessibilityRole="button"
						accessibilityLabel={
							count !== undefined
								? `${t(`inbox.filter_${filter}`)}, ${count}`
								: t(`inbox.filter_${filter}`)
						}
						hitSlop={{ top: 6, bottom: 6 }}
						accessibilityState={{ selected }}
						style={[
							styles.chip,
							{
								backgroundColor: selected ? c.fill : c.card,
								borderColor: selected ? c.fill : c.border,
							},
						]}
					>
						<Text
							style={[
								styles.label,
								selected ? styles.labelSelected : null,
								{ color: selected ? onSelected : c.body },
							]}
						>
							{t(`inbox.filter_${filter}`)}
						</Text>
						{count !== undefined ? (
							<View
								style={[
									styles.badge,
									{
										backgroundColor: selected
											? "rgba(255,255,255,0.2)"
											: c.neutralSoft,
									},
								]}
							>
								<Text
									style={[
										styles.badgeText,
										{ color: selected ? onSelected : c.neutralText },
									]}
								>
									{count}
								</Text>
							</View>
						) : null}
					</AnimatedPressable>
				);
			})}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	scroll: { flexGrow: 0 },
	row: {
		flexDirection: "row",
		gap: 8,
		paddingHorizontal: 16,
		paddingVertical: 10,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 999,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 14,
		minHeight: 36,
	},
	label: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	labelSelected: { fontFamily: Fonts.bodyBold },
	badge: {
		borderRadius: 999,
		paddingHorizontal: 6,
		minWidth: 20,
		paddingVertical: 1,
		alignItems: "center",
	},
	badgeText: { fontSize: 12, fontFamily: Fonts.displayBold },
});
