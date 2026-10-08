import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChoiceField, TextField } from "@/src/components/delivery/FormFields";
import { EmptyState } from "@/src/components/EmptyState";
import { Card, PurchaseButton } from "@/src/components/purchases/ui";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useNow } from "@/src/hooks/useNow";
import {
	useOrderShipments,
	useRescheduleShipment,
} from "@/src/hooks/useShipments";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { type DeliveryWindow, WINDOW_LABELS } from "@/src/lib/shipmentStatus";
import { rescheduleAllowed, rescheduleDays } from "@/src/lib/shipmentTracking";

const WINDOWS: readonly DeliveryWindow[] = ["morning", "afternoon", "evening"];

function RescheduleForm({ shipmentId }: { shipmentId: string }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const now = useNow();
	const days = rescheduleDays(now);
	const reschedule = useRescheduleShipment(shipmentId);
	const [date, setDate] = useState(days[0]?.iso ?? "");
	const [window, setWindow] = useState<DeliveryWindow>("morning");
	const [landmark, setLandmark] = useState("");
	const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
	const [denied, setDenied] = useState(false);
	const landmarkInvalid = landmark.trim() !== "" && landmark.trim().length < 5;

	const dayLabel = (iso: string) =>
		new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", {
			weekday: "short",
			day: "numeric",
			month: "short",
			timeZone: "Africa/Douala",
		}).format(new Date(iso));

	const locate = async () => {
		try {
			const { status } = await Location.requestForegroundPermissionsAsync();
			if (status !== "granted") return setDenied(true);
			const { coords } = await Location.getCurrentPositionAsync({
				accuracy: Location.Accuracy.High,
			});
			setDenied(false);
			setGps({ lat: coords.latitude, lng: coords.longitude });
		} catch {
			setDenied(true);
		}
	};

	return (
		<ScrollView
			contentContainerStyle={styles.content}
			keyboardShouldPersistTaps="handled"
		>
			<Card>
				<ChoiceField
					label={t("tracking.rescheduleDate")}
					options={days.map((day) => day.iso)}
					value={date}
					onChange={setDate}
					labelOf={dayLabel}
				/>
				<ChoiceField
					label={t("tracking.rescheduleWindow")}
					options={WINDOWS}
					value={window}
					onChange={setWindow}
					labelOf={(option) => t(WINDOW_LABELS[option])}
				/>
				<TextField
					label={t("tracking.rescheduleLandmark")}
					value={landmark}
					onChange={setLandmark}
					error={
						landmarkInvalid ? "tracking.rescheduleLandmarkShort" : undefined
					}
				/>
				<PurchaseButton
					tone="outline"
					label={
						gps ? t("tracking.positionCaptured") : t("tracking.usePosition")
					}
					onPress={() => void locate()}
				/>
				{denied ? (
					<Text style={{ color: c.muted }}>{t("tracking.positionDenied")}</Text>
				) : null}
				{reschedule.error ? (
					<Text accessibilityRole="alert" style={{ color: c.danger }}>
						{resolveErrorMessage(reschedule.error, t)}
					</Text>
				) : null}
				<PurchaseButton
					label={t("tracking.rescheduleSubmit")}
					pending={reschedule.isPending}
					disabled={!date || landmarkInvalid}
					onPress={() =>
						reschedule.mutate(
							{
								date,
								window,
								...(landmark.trim() ? { landmark: landmark.trim() } : {}),
								...(gps ? { gps } : {}),
							},
							{ onSuccess: () => router.back() },
						)
					}
				/>
			</Card>
		</ScrollView>
	);
}

export default function RescheduleScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { id } = useLocalSearchParams<{ id: string }>();
	const shipments = useOrderShipments(id);
	const now = useNow();
	const target = shipments.data?.find((view) => rescheduleAllowed(view, now));
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("tracking.rescheduleTitle")} />
			{shipments.isPending ? (
				<ActivityIndicator style={styles.spinner} color={c.primary} />
			) : target ? (
				<RescheduleForm shipmentId={target.id} />
			) : (
				<EmptyState
					illustration="notFound"
					title={t("tracking.rescheduleClosed")}
					ctaLabel={t("common.back")}
					onCta={() => router.back()}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	spinner: { marginTop: 40 },
	content: { padding: 16, paddingBottom: 48 },
});
