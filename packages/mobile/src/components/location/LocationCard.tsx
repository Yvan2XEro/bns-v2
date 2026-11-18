import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatPlaceLabel } from "@/src/lib/places";
import { useUserLocation } from "@/src/lib/useUserLocation";
import { LocationSheet } from "./LocationSheet";

/**
 * The home feed's scope, drawn as a selector rather than a promo card: a
 * white row like a dropdown field, "Annonces de" over the place in bold, and
 * the way to change it on the right. Optional by design: nobody has to pick a
 * city to browse, so it never shouts with a filled button.
 */
export function LocationCard() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const { browsePlace, setBrowsePlace } = useUserLocation();
	const place = browsePlace
		? formatPlaceLabel({ ...browsePlace, region: "" })
		: null;
	const value = place ?? t("locationSheet.allCities");

	return (
		<>
			<Pressable
				onPress={() => setOpen(true)}
				style={({ pressed }) => [
					styles.row,
					{ backgroundColor: c.card, borderColor: c.border },
					pressed && { backgroundColor: c.neutralSoft },
				]}
				accessibilityRole="button"
				accessibilityLabel={t("locationSheet.chipLabel", { place: value })}
				accessibilityHint={t("locationSheet.chipHint")}
			>
				<Ionicons
					name={place ? "location" : "location-outline"}
					size={22}
					color={c.link}
				/>
				<View style={styles.copy}>
					<Text style={[styles.caption, { color: c.muted }]} numberOfLines={1}>
						{t("locationSheet.scopeLabel")}
					</Text>
					<Text style={[styles.value, { color: c.text }]} numberOfLines={1}>
						{value}
					</Text>
				</View>
				<View style={styles.action}>
					<Text style={[styles.actionText, { color: c.link }]}>
						{place
							? t("locationSheet.cardChange")
							: t("locationSheet.cardChoose")}
					</Text>
					<Ionicons name="chevron-down" size={16} color={c.link} />
				</View>
			</Pressable>
			<LocationSheet
				visible={open}
				onClose={() => setOpen(false)}
				title={t("locationSheet.browseTitle")}
				selected={browsePlace}
				onSelect={(picked) => void setBrowsePlace(picked)}
				onSelectAll={() => void setBrowsePlace(null)}
				allSelected={!browsePlace}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginHorizontal: 16,
		minHeight: 56,
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 14,
		borderWidth: 1,
	},
	copy: { flex: 1, minWidth: 0 },
	caption: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.body },
	value: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	action: { flexDirection: "row", alignItems: "center", gap: 4 },
	actionText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
});
