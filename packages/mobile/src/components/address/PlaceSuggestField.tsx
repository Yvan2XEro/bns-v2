import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formStyles } from "@/src/components/seller/formStyles";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { usePlaceSearch } from "@/src/hooks/usePlaces";
import { useTranslation } from "@/src/lib/i18n";
import type { Place } from "@/src/lib/places";

/**
 * District search through the app's Photon geocoder. Help only: without a
 * geocoder, or offline, the chips below stay the way to fill the address.
 */
export function PlaceSuggestField({
	onPick,
}: {
	onPick: (place: Place) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { photonUrl } = useAppConfig();
	const [text, setText] = useState("");
	const [open, setOpen] = useState(false);
	const { places, searching } = usePlaceSearch(text);
	if (!photonUrl) return null;

	return (
		<View style={{ gap: 6 }}>
			<Text style={[formStyles.label, { color: c.body }]}>
				{t("addresses.searchPlace")}
			</Text>
			<TextInput
				value={text}
				onChangeText={(next) => {
					setText(next);
					setOpen(true);
				}}
				placeholder={t("addresses.searchPlaceHint")}
				placeholderTextColor={c.muted}
				accessibilityLabel={t("addresses.searchPlace")}
				autoCorrect={false}
				style={[
					formStyles.input,
					{ color: c.text, backgroundColor: c.input, borderColor: c.border },
				]}
			/>
			{open && text.trim().length >= 2 ? (
				<View
					style={{
						borderWidth: 1,
						borderColor: c.border,
						borderRadius: 12,
						backgroundColor: c.card,
					}}
				>
					{places.map((place) => (
						<Pressable
							key={`${place.name}|${place.district ?? ""}|${place.region}`}
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
							style={{
								minHeight: 44,
								flexDirection: "row",
								alignItems: "center",
								gap: 8,
								paddingHorizontal: 12,
							}}
						>
							<Ionicons name="location-outline" size={16} color={c.muted} />
							<Text
								style={{ color: c.text, fontFamily: Fonts.bodySemibold }}
								numberOfLines={1}
							>
								{place.district ?? place.name}
							</Text>
							<Text style={{ color: c.muted }} numberOfLines={1}>
								{place.district ? place.name : place.region}
							</Text>
						</Pressable>
					))}
					{places.length === 0 ? (
						<Text style={[formStyles.hint, { color: c.muted, padding: 12 }]}>
							{searching ? t("addresses.searching") : t("addresses.noPlace")}
						</Text>
					) : null}
				</View>
			) : null}
		</View>
	);
}
