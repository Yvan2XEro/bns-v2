import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { formStyles } from "@/src/components/seller/formStyles";
import { useShopTheme } from "@/src/components/shop/theme";
import {
	type GpsValue,
	googleMapsUrl,
	gpsFromCoords,
} from "@/src/lib/checkoutForm";
import { useTranslation } from "@/src/lib/i18n";

type Status = "idle" | "locating" | "denied" | "unavailable";

/**
 * "Use my location". A refused permission, services switched off or a fix
 * that never comes all leave the landmark to do the job, so none of them is
 * an error: each is a short note under the button.
 */
export function LocationField({
	value,
	onChange,
}: {
	value: GpsValue | undefined;
	onChange: (next: GpsValue | undefined) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [status, setStatus] = useState<Status>("idle");

	const locate = async () => {
		setStatus("locating");
		try {
			const { status: permission } =
				await Location.requestForegroundPermissionsAsync();
			if (permission !== "granted") {
				setStatus("denied");
				return;
			}
			const position = await Location.getCurrentPositionAsync({
				accuracy: Location.Accuracy.High,
			});
			onChange(gpsFromCoords(position.coords));
			setStatus("idle");
		} catch {
			setStatus("unavailable");
		}
	};

	return (
		<View style={[styles.box, { borderColor: c.primarySoft }]}>
			<Pressable
				onPress={() => void locate()}
				disabled={status === "locating"}
				accessibilityRole="button"
				accessibilityLabel={t("checkout.useMyLocation")}
				accessibilityState={{ busy: status === "locating" }}
				style={[styles.button, { borderColor: c.primary }]}
			>
				{status === "locating" ? (
					<ActivityIndicator color={c.primary} />
				) : (
					<Ionicons name="locate" size={18} color={c.primary} />
				)}
				<Text style={[styles.buttonText, { color: c.primary }]}>
					{status === "locating"
						? t("checkout.locating")
						: t("checkout.useMyLocation")}
				</Text>
			</Pressable>
			{value ? (
				<View style={{ gap: 4 }}>
					<Text style={[formStyles.hint, { color: c.successText }]}>
						{t("checkout.locationCaptured")}
					</Text>
					{value.accuracyMeters !== undefined ? (
						<Text style={[formStyles.hint, { color: c.muted }]}>
							{t("checkout.locationAccuracy", {
								accuracy: value.accuracyMeters,
							})}
						</Text>
					) : null}
					<View style={formStyles.row}>
						<Pressable
							onPress={() =>
								void Linking.openURL(googleMapsUrl(value.lat, value.lng))
							}
							accessibilityRole="link"
							accessibilityLabel={t("checkout.openInMaps")}
							style={styles.link}
						>
							<Text style={[styles.linkText, { color: c.primary }]}>
								{t("checkout.openInMaps")}
							</Text>
						</Pressable>
						<Pressable
							onPress={() => onChange(undefined)}
							accessibilityRole="button"
							accessibilityLabel={t("checkout.clearLocation")}
							style={styles.link}
						>
							<Text style={[styles.linkText, { color: c.muted }]}>
								{t("checkout.clearLocation")}
							</Text>
						</Pressable>
					</View>
				</View>
			) : null}
			{!value && status === "denied" ? (
				<Text style={[formStyles.hint, { color: c.muted }]}>
					{t("checkout.locationDenied")}
				</Text>
			) : null}
			{!value && status === "unavailable" ? (
				<Text style={[formStyles.hint, { color: c.muted }]}>
					{t("checkout.locationUnavailable")}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	box: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
	button: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
	},
	buttonText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	link: { minHeight: 44, justifyContent: "center" },
	linkText: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
		textDecorationLine: "underline",
	},
});
