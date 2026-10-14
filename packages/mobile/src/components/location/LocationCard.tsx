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
 * The home feed's scope, as a card in the feed: "All cities" until the user
 * picks one. Optional by design — nobody has to choose a city to browse — so
 * it explains what choosing one does rather than asking for it up front.
 */
export function LocationCard() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const { browsePlace, setBrowsePlace } = useUserLocation();
	const place = browsePlace
		? formatPlaceLabel({ ...browsePlace, region: "" })
		: null;

	return (
		<>
			<Pressable
				onPress={() => setOpen(true)}
				style={({ pressed }) => [
					styles.card,
					{ backgroundColor: c.card, borderColor: c.border },
					pressed && styles.pressed,
				]}
				accessibilityRole="button"
				accessibilityLabel={t("locationSheet.chipLabel", {
					place: place ?? t("locationSheet.allCities"),
				})}
				accessibilityHint={t("locationSheet.chipHint")}
			>
				<View style={[styles.iconTile, { backgroundColor: c.primarySoft }]}>
					<Ionicons
						name={place ? "location" : "map-outline"}
						size={22}
						color={c.primary}
					/>
				</View>
				<View style={styles.copy}>
					<Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
						{place
							? t("locationSheet.cardTitlePlace", { place })
							: t("locationSheet.cardTitleAll")}
					</Text>
					<Text style={[styles.body, { color: c.muted }]}>
						{place
							? t("locationSheet.cardBodyPlace")
							: t("locationSheet.cardBodyAll")}
					</Text>
				</View>
				<View style={[styles.action, { backgroundColor: c.primary }]}>
					<Text style={styles.actionText}>
						{place
							? t("locationSheet.cardChange")
							: t("locationSheet.cardChoose")}
					</Text>
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
	card: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginHorizontal: 16,
		padding: 14,
		borderRadius: 18,
		borderWidth: 1,
		shadowColor: "#1e40af",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.06,
		shadowRadius: 8,
		elevation: 1,
	},
	pressed: { opacity: 0.85 },
	iconTile: {
		width: 44,
		height: 44,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	copy: { flex: 1, gap: 2 },
	title: { fontSize: 15, fontFamily: Fonts.displayBold },
	body: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.body },
	action: {
		minHeight: 36,
		paddingHorizontal: 14,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	actionText: { color: "#fff", fontSize: 13, fontFamily: Fonts.bodySemibold },
});
