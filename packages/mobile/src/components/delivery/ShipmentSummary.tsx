import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { Pressable, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { formStyles } from "@/src/components/seller/formStyles";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import { mapsUrlFor, readDestination } from "@/src/lib/riderShipment";
import {
	FAILURE_REASON_LABELS,
	type FailureReason,
	shipmentStatusLabel,
} from "@/src/lib/shipmentStatus";
import { telHref } from "@/src/lib/shipmentTracking";
import type { ShopShipmentView } from "../../../../api/src/contracts/shipments";

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
	const c = useShopTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="link"
			accessibilityLabel={label}
			style={{ minHeight: 44, justifyContent: "center" }}
		>
			<Text style={{ color: c.primary, fontFamily: Fonts.bodySemibold }}>
				{label}
			</Text>
		</Pressable>
	);
}

const reasonKey = (reason: string | null | undefined) =>
	FAILURE_REASON_LABELS[
		(reason as FailureReason) in FAILURE_REASON_LABELS
			? (reason as FailureReason)
			: "other"
	];

export function ShipmentSummary({ view }: { view: ShopShipmentView }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const destination = readDestination(view.destination);
	const body = { color: c.body, fontFamily: Fonts.body };
	return (
		<View style={{ gap: 12 }}>
			<View
				style={[
					formStyles.card,
					{ borderColor: c.border, backgroundColor: c.card },
				]}
			>
				<Text
					style={{ color: c.text, fontFamily: Fonts.displayBold, fontSize: 16 }}
				>
					{t(
						shipmentStatusLabel(
							"seller",
							view.status,
							Boolean(view.readyForPickupAt),
						),
					)}
				</Text>
				{destination.recipientName ? (
					<Text style={body}>{destination.recipientName}</Text>
				) : null}
				<Text style={body}>
					{[destination.landmark, destination.district, destination.city]
						.filter(Boolean)
						.join(", ")}
				</Text>
				{destination.phone ? (
					<LinkRow
						label={t("shipmentPanel.callBuyer")}
						onPress={() =>
							void Linking.openURL(telHref(destination.phone ?? ""))
						}
					/>
				) : null}
				{destination.gps ? (
					<LinkRow
						label={t("shipmentPanel.openInMaps")}
						onPress={() =>
							void Linking.openURL(
								mapsUrlFor(destination.gps ?? { lat: 0, lng: 0 }),
							)
						}
					/>
				) : null}
			</View>
			{view.rider?.name ? (
				<View
					style={[
						formStyles.card,
						{ borderColor: c.border, backgroundColor: c.card },
					]}
				>
					<Text style={{ color: c.text, fontFamily: Fonts.bodySemibold }}>
						{t("shipmentPanel.rider", { name: view.rider.name })}
					</Text>
					{view.rider.phone ? (
						<LinkRow
							label={t("shipmentPanel.callRider")}
							onPress={() =>
								void Linking.openURL(telHref(view.rider?.phone ?? ""))
							}
						/>
					) : null}
					{view.riderLink ? (
						<Text style={body}>
							{view.riderLink.revokedAt
								? t("shipmentPanel.linkRevoked")
								: t("shipmentPanel.linkActive")}
						</Text>
					) : null}
				</View>
			) : null}
			{(view.attempts ?? []).length > 0 ? (
				<View
					style={[
						formStyles.card,
						{ borderColor: c.border, backgroundColor: c.card },
					]}
				>
					<Text style={{ color: c.text, fontFamily: Fonts.bodySemibold }}>
						{t("tracking.attempts", { count: (view.attempts ?? []).length })}
					</Text>
					{(view.attempts ?? []).map((attempt) => (
						<View key={attempt.number}>
							<Text
								style={body}
							>{`${attempt.number}. ${t(reasonKey(attempt.reason))}${attempt.note ? ` - ${attempt.note}` : ""}`}</Text>
							{attempt.gps?.lat != null && attempt.gps.lng != null ? (
								<LinkRow
									label={t("shipmentPanel.openInMaps")}
									onPress={() =>
										void Linking.openURL(
											mapsUrlFor({
												lat: attempt.gps?.lat ?? 0,
												lng: attempt.gps?.lng ?? 0,
											}),
										)
									}
								/>
							) : null}
						</View>
					))}
				</View>
			) : null}
			{view.proof ? (
				<View
					style={[
						formStyles.card,
						{ borderColor: c.border, backgroundColor: c.card },
					]}
				>
					<Text style={{ color: c.text, fontFamily: Fonts.bodySemibold }}>
						{view.proof.codeVerified
							? t("tracking.codeVerified")
							: t("shipmentPanel.proofDeclared")}
					</Text>
					{view.proof.photoUrl ? (
						<Image
							source={{
								uri: resolveImageUrl(view.proof.photoUrl) ?? undefined,
							}}
							accessibilityLabel={t("tracking.proofPhoto")}
							style={{ width: 120, height: 120, borderRadius: 10 }}
							contentFit="cover"
						/>
					) : null}
				</View>
			) : null}
		</View>
	);
}
