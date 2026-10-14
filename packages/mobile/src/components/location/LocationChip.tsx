import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatPlaceLabel } from "@/src/lib/places";
import { useUserLocation } from "@/src/lib/useUserLocation";
import { LocationSheet } from "./LocationSheet";

/**
 * The home feed's scope: "All cities" until the user picks one. Optional by
 * design — nobody has to choose a city to browse.
 */
export function LocationChip() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const { browsePlace, setBrowsePlace } = useUserLocation();
	const label = browsePlace
		? formatPlaceLabel({ ...browsePlace, region: "" })
		: t("locationSheet.allCities");

	return (
		<>
			<Pressable
				onPress={() => setOpen(true)}
				style={[
					styles.chip,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
				accessibilityRole="button"
				accessibilityLabel={t("locationSheet.chipLabel", { place: label })}
				accessibilityHint={t("locationSheet.chipHint")}
				hitSlop={4}
			>
				<Ionicons
					name={browsePlace ? "location" : "globe-outline"}
					size={15}
					color={c.primary}
				/>
				<Text style={[styles.text, { color: c.text }]} numberOfLines={1}>
					{label}
				</Text>
				<Ionicons name="chevron-down" size={14} color={c.muted} />
			</Pressable>
			<LocationSheet
				visible={open}
				onClose={() => setOpen(false)}
				title={t("locationSheet.browseTitle")}
				selected={browsePlace}
				onSelect={(place) => void setBrowsePlace(place)}
				onSelectAll={() => void setBrowsePlace(null)}
				allSelected={!browsePlace}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	chip: {
		alignSelf: "flex-start",
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 36,
		maxWidth: "100%",
		paddingHorizontal: 12,
		borderRadius: 18,
		borderWidth: 1,
	},
	text: { flexShrink: 1, fontSize: 13, fontFamily: Fonts.bodySemibold },
});
