import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailSkeleton } from "@/src/components/checkout/DetailSkeleton";
import { FormError } from "@/src/components/checkout/FormError";
import { ChoiceField, TextField } from "@/src/components/delivery/FormFields";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import {
	Card,
	PurchaseButton,
	purchaseText,
} from "@/src/components/purchases/ui";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
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
	const { showSuccess } = useAlert();
	const [locating, setLocating] = useState(false);
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

	// A fix outdoors can take seconds: the button says it is working, and a
	// slow fix gives up after 10 s rather than leaving the buyer tapping.
	const locate = async () => {
		if (locating) return;
		setLocating(true);
		try {
			const { status } = await Location.requestForegroundPermissionsAsync();
			if (status !== "granted") return setDenied(true);
			const position = await Promise.race([
				Location.getCurrentPositionAsync({
					accuracy: Location.Accuracy.Balanced,
				}),
				new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
			]);
			if (!position) return;
			setDenied(false);
			setGps({
				lat: position.coords.latitude,
				lng: position.coords.longitude,
			});
		} catch {
			setDenied(true);
		} finally {
			setLocating(false);
		}
	};

	return (
		<ScreenColumn width="reading">
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
						pending={locating}
						onPress={() => void locate()}
					/>
					{denied ? (
						<Text style={[purchaseText.muted, { color: c.muted }]}>
							{t("tracking.positionDenied")}
						</Text>
					) : null}
					<FormError
						message={
							reschedule.error ? resolveErrorMessage(reschedule.error, t) : null
						}
					/>
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
								{
									onSuccess: () => {
										showSuccess(
											t("tracking.rescheduled", {
												date: dayLabel(date),
												window: t(WINDOW_LABELS[window]),
											}),
										);
										router.back();
									},
								},
							)
						}
					/>
				</Card>
			</ScrollView>
		</ScreenColumn>
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
				<DetailSkeleton cards={1} />
			) : shipments.isError ? (
				// Offline is not "the window closed": say what failed, offer a retry.
				<EmptyState
					illustration="notFound"
					title={resolveErrorMessage(shipments.error, t)}
					ctaLabel={t("common.retry")}
					onCta={() => void shipments.refetch()}
				/>
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
	content: { padding: 16, gap: 14, paddingBottom: 48 },
});
