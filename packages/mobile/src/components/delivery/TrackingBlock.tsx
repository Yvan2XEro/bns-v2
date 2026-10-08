import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import {
	FAILURE_REASON_LABELS,
	type FailureReason,
	shipmentStatusLabel,
	WINDOW_LABELS,
} from "@/src/lib/shipmentStatus";
import {
	pickupCountdown,
	rescheduleAllowed,
	showRiderCard,
	telHref,
	trackingSteps,
} from "@/src/lib/shipmentTracking";
import type { BuyerShipmentView } from "../../../../api/src/contracts/shipments";
import { Card, PurchaseButton } from "../purchases/ui";

const when = (iso: string | null, lang: "fr" | "en") =>
	iso
		? new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", {
				weekday: "short",
				day: "numeric",
				month: "short",
				hour: "2-digit",
				minute: "2-digit",
				timeZone: "Africa/Douala",
			}).format(new Date(iso))
		: null;

const reasonLabel = (reason: string) =>
	reason in FAILURE_REASON_LABELS
		? FAILURE_REASON_LABELS[reason as FailureReason]
		: FAILURE_REASON_LABELS.other;

/** One shipment of a purchase: stepper, rider, attempts, pickup deadline, proof. */
export function TrackingBlock({
	view,
	lang,
	now,
	onReschedule,
	onContest,
}: {
	view: BuyerShipmentView;
	lang: "fr" | "en";
	now: Date;
	onReschedule: () => void;
	onContest?: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const steps = trackingSteps(view);
	const countdown = pickupCountdown(view.pickup?.pickupDeadline ?? null, now);
	const outcome =
		view.status === "failed" ||
		view.status === "returned" ||
		view.status === "cancelled";
	return (
		<Card>
			<Text style={[styles.title, { color: c.text }]}>
				{t("tracking.title", { number: view.shipmentNumber })}
			</Text>
			{outcome ? (
				<Text style={{ color: c.danger, fontFamily: Fonts.bodySemibold }}>
					{t(shipmentStatusLabel("buyer", view.status))}
				</Text>
			) : null}
			{view.promisedBy && !outcome && view.status !== "delivered" ? (
				<Text style={{ color: c.body, fontFamily: Fonts.body }}>
					{t("tracking.promisedBy", { date: when(view.promisedBy, lang) })}
				</Text>
			) : null}
			<View accessibilityRole="list" style={{ gap: 8 }}>
				{steps.map((step) => (
					<View key={step.labelKey} style={styles.step}>
						<View
							style={[
								styles.dot,
								{
									backgroundColor:
										step.state === "done"
											? c.primary
											: step.state === "current"
												? c.warningText
												: c.border,
								},
							]}
						/>
						<Text
							style={{
								flex: 1,
								color: step.state === "upcoming" ? c.muted : c.text,
								fontFamily:
									step.state === "current" ? Fonts.bodySemibold : Fonts.body,
							}}
						>
							{t(step.labelKey)}
							{step.at ? ` · ${when(step.at, lang)}` : ""}
						</Text>
					</View>
				))}
			</View>

			{showRiderCard(view) && view.rider ? (
				<View style={styles.block}>
					<Text style={{ color: c.text, fontFamily: Fonts.bodySemibold }}>
						{t("tracking.rider", { name: view.rider.firstName })}
					</Text>
					<PurchaseButton
						tone="outline"
						label={t("tracking.callRider")}
						onPress={() =>
							void Linking.openURL(telHref(view.rider?.phone ?? ""))
						}
					/>
				</View>
			) : null}

			{view.attempts.length > 0 ? (
				<View style={styles.block}>
					<Text style={{ color: c.text, fontFamily: Fonts.bodySemibold }}>
						{t("tracking.attempts", { count: view.attempts.length })}
					</Text>
					{view.attempts.map((attempt) => (
						<Text
							key={attempt.number}
							style={{ color: c.body, fontFamily: Fonts.body }}
						>
							{`${attempt.number}. ${t(reasonLabel(attempt.reason))} · ${when(attempt.at, lang)}`}
						</Text>
					))}
				</View>
			) : null}

			{view.redelivery ? (
				<Text style={{ color: c.body, fontFamily: Fonts.body }}>
					{t("tracking.redelivery", {
						date: when(view.redelivery.scheduledFor, lang),
						window: t(WINDOW_LABELS[view.redelivery.window]),
					})}
				</Text>
			) : null}
			{rescheduleAllowed(view, now) ? (
				<PurchaseButton
					label={t("tracking.reschedule")}
					onPress={onReschedule}
				/>
			) : null}

			{view.pickup ? (
				<View style={styles.block}>
					<Text style={{ color: c.text, fontFamily: Fonts.bodySemibold }}>
						{view.pickup.locationName}
					</Text>
					<Text style={{ color: c.body, fontFamily: Fonts.body }}>
						{view.pickup.landmark}
					</Text>
					<Text style={{ color: c.body, fontFamily: Fonts.body }}>
						{view.pickup.hours}
					</Text>
					{countdown.kind !== "none" ? (
						<Text
							style={{ color: c.warningText, fontFamily: Fonts.bodySemibold }}
						>
							{countdown.kind === "expired"
								? t("tracking.pickupExpired")
								: t(`tracking.pickupLeft_${countdown.kind}`, {
										count: countdown.count,
									})}
						</Text>
					) : null}
				</View>
			) : null}

			{view.trackingUrl ? (
				<PurchaseButton
					tone="outline"
					label={t("tracking.openTracking")}
					onPress={() => void Linking.openURL(view.trackingUrl ?? "")}
				/>
			) : null}

			{view.proof ? (
				<View style={styles.block}>
					<Text style={{ color: c.text, fontFamily: Fonts.bodySemibold }}>
						{t("tracking.proof", { date: when(view.proof.capturedAt, lang) })}
					</Text>
					{view.proof.codeVerified ? (
						<Text
							style={{ color: c.successText, fontFamily: Fonts.bodySemibold }}
						>
							{t("tracking.codeVerified")}
						</Text>
					) : null}
					{view.proof.photoUrl ? (
						<Image
							source={{
								uri: resolveImageUrl(view.proof.photoUrl) ?? undefined,
							}}
							accessibilityLabel={t("tracking.proofPhoto")}
							style={styles.photo}
							contentFit="cover"
						/>
					) : null}
					{onContest ? (
						<PurchaseButton
							tone="outline"
							label={t("tracking.contest")}
							onPress={onContest}
						/>
					) : null}
				</View>
			) : null}
		</Card>
	);
}

const styles = StyleSheet.create({
	title: { fontSize: 16, fontFamily: Fonts.displayBold },
	step: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 28 },
	dot: { width: 12, height: 12, borderRadius: 6 },
	block: { gap: 6, marginTop: 6 },
	photo: { width: 120, height: 120, borderRadius: 10 },
});
