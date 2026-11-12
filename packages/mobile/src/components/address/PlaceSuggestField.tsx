import { Ionicons } from "@expo/vector-icons";
import { Fragment, useState } from "react";
import {
	ActivityIndicator,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { FormField } from "@/src/components/settings/FormField";
import { useGroupedColors } from "@/src/components/settings/Grouped";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { usePlaceSearch } from "@/src/hooks/usePlaces";
import { useTranslation } from "@/src/lib/i18n";
import type { Place } from "@/src/lib/places";

/** The pin (18) and its gap (12) past the row's 16pt edge. */
const TEXT_INSET = 16 + 18 + 12;

/**
 * District search through the app's Photon geocoder. Help only: without a
 * geocoder, or offline, the chips below stay the way to fill the address.
 */
export function PlaceSuggestField({
	onPick,
}: {
	onPick: (place: Place) => void;
}) {
	const c = useGroupedColors();
	const { t } = useTranslation();
	const { photonUrl } = useAppConfig();
	const [text, setText] = useState("");
	const [open, setOpen] = useState(false);
	const { places, searching } = usePlaceSearch(text);
	if (!photonUrl) return null;

	const showList = open && text.trim().length >= 2;

	return (
		<View style={styles.wrap}>
			<FormField
				label={t("addresses.searchPlace")}
				icon="search-outline"
				value={text}
				onChangeText={(next) => {
					setText(next);
					setOpen(true);
				}}
				placeholder={t("addresses.searchPlaceHint")}
				autoCorrect={false}
				autoCapitalize="words"
				returnKeyType="search"
			/>
			{showList ? (
				<View
					style={[
						styles.list,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
					accessibilityLiveRegion="polite"
				>
					{places.map((place, i) => {
						const primary = place.district ?? place.name;
						const secondary = place.district ? place.name : place.region;
						return (
							<Fragment
								key={`${place.name}|${place.district ?? ""}|${place.region}`}
							>
								{i > 0 ? (
									<View
										style={[styles.separator, { backgroundColor: c.border }]}
									/>
								) : null}
								<Pressable
									onPress={() => {
										onPick(place);
										setText(
											place.district
												? `${place.district}, ${place.name}`
												: place.name,
										);
										setOpen(false);
									}}
									accessibilityRole="button"
									accessibilityLabel={[primary, secondary]
										.filter(Boolean)
										.join(", ")}
									android_ripple={{ color: c.well }}
									style={({ pressed }) => [
										styles.row,
										pressed && Platform.OS === "ios"
											? { backgroundColor: c.well }
											: null,
									]}
								>
									<Ionicons
										name="location-outline"
										size={18}
										color={c.mutedForeground}
									/>
									<View style={styles.rowText}>
										<Text
											style={[styles.primary, { color: c.foreground }]}
											numberOfLines={1}
										>
											{primary}
										</Text>
										{secondary ? (
											<Text
												style={[styles.secondary, { color: c.mutedForeground }]}
												numberOfLines={1}
											>
												{secondary}
											</Text>
										) : null}
									</View>
								</Pressable>
							</Fragment>
						);
					})}
					{places.length === 0 ? (
						<View style={styles.status}>
							{searching ? (
								<ActivityIndicator size="small" color={c.link} />
							) : null}
							<Text style={[styles.statusText, { color: c.mutedForeground }]}>
								{searching ? t("addresses.searching") : t("addresses.noPlace")}
							</Text>
						</View>
					) : null}
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { gap: 8 },
	list: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	separator: { height: StyleSheet.hairlineWidth, marginLeft: TEXT_INSET },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 52,
		paddingHorizontal: 16,
		paddingVertical: 8,
	},
	rowText: { flex: 1, gap: 1 },
	primary: { fontSize: 16, lineHeight: 21, fontFamily: Fonts.bodyMedium },
	secondary: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	status: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	statusText: {
		flex: 1,
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.body,
	},
});
