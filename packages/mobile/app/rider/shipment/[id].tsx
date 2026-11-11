import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { DetailSkeleton } from "@/src/components/moderation/ModerationKit";
import { moderationTones } from "@/src/components/moderation/tones";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { usePickUp } from "@/src/hooks/useRiderShipments";
import { useShipment } from "@/src/hooks/useShipmentActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { tryCurrentGps } from "@/src/lib/currentPosition";
import { feedback } from "@/src/lib/feedback";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { destinationMapsUrl, riderButtons } from "@/src/lib/riderShipment";
import { shipmentStatusLabel } from "@/src/lib/shipmentStatus";
import { telHref } from "@/src/lib/shipmentTracking";

/**
 * The rider's run sheet, read on a bike with one hand: the status and the
 * address in large type, the cash to collect on a yellow tag, two big tiles
 * (call, maps) in the middle of the screen and the one forward action pinned
 * under the thumb. Nothing on it is smaller than 56pt to hit.
 */
export default function RiderShipmentScreen() {
	const c = useShopTheme();
	const k = moderationTones(c.isDark);
	const insets = useSafeAreaInsets();
	const { t, i18n } = useTranslation();
	const { id } = useLocalSearchParams<{ id: string }>();
	const query = useShipment(id);
	const pickUp = usePickUp(id);
	const view = query.data && "allowedActions" in query.data ? query.data : null;
	const maps = view ? destinationMapsUrl(view.destination) : null;
	const buttons = view ? riderButtons(view.allowedActions) : [];
	const canPickUp = buttons.includes("pick_up");
	const sun = c.isDark ? Colors.dark.sun : Colors.light.sun;

	const onPickUp = async () => {
		pickUp.mutate((await tryCurrentGps()) ?? undefined, {
			// The parcel is now the rider's responsibility: say so in the hand.
			onSuccess: () => feedback("success"),
		});
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={
					view
						? t("tracking.title", { number: view.shipmentNumber })
						: t("shipmentPanel.title")
				}
			/>
			{query.isPending ? (
				<DetailSkeleton />
			) : !view ? (
				<EmptyState
					illustration="notFound"
					title={t("shipmentPanel.loadError")}
					subtitle={
						query.error ? resolveErrorMessage(query.error, t) : undefined
					}
					ctaLabel={t("common.retry")}
					onCta={() => query.refetch()}
				/>
			) : (
				<>
					<ScreenColumn width="reading">
						<ScrollView contentContainerStyle={styles.content}>
							<Text
								accessibilityRole="header"
								style={[styles.status, { color: c.text }]}
							>
								{t(shipmentStatusLabel("seller", view.status))}
							</Text>

							<View
								style={[
									styles.card,
									{ backgroundColor: c.card, borderColor: c.border },
								]}
							>
								<View style={styles.line}>
									<Ionicons name="location" size={22} color={k.linkText} />
									<View style={styles.flex}>
										{view.destination.recipientFirstName ? (
											<Text style={[styles.recipient, { color: c.text }]}>
												{view.destination.recipientFirstName}
											</Text>
										) : null}
										<Text style={[styles.address, { color: c.text }]}>
											{[
												view.destination.landmark,
												view.destination.district,
												view.destination.city,
											]
												.filter(Boolean)
												.join(", ")}
										</Text>
									</View>
								</View>
								{view.storefrontName ? (
									<View
										style={[
											styles.line,
											styles.divided,
											{ borderTopColor: c.border },
										]}
									>
										<Ionicons name="storefront" size={20} color={c.muted} />
										<Text style={[styles.body, styles.flex, { color: c.body }]}>
											{view.storefrontName}
										</Text>
									</View>
								) : null}
								{view.items.length > 0 ? (
									<View
										style={[
											styles.line,
											styles.divided,
											{ borderTopColor: c.border },
										]}
									>
										<Ionicons name="cube" size={20} color={c.muted} />
										<Text style={[styles.body, styles.flex, { color: c.body }]}>
											{view.items
												.map((item) => `${item.quantity} × ${item.title}`)
												.join("\n")}
										</Text>
									</View>
								) : null}
							</View>

							{view.expectedCod != null ? (
								// Cash is the one number a rider must not get wrong: it
								// is painted on the yellow tag, as large as a price.
								<View style={[styles.cashTag, { backgroundColor: sun }]}>
									<Ionicons
										name="cash"
										size={26}
										color={Colors.light.sunForeground}
									/>
									<Text style={styles.cashText}>
										{t("shipmentPanel.cashToCollect", {
											amount: formatPrice(view.expectedCod, i18n.language),
										})}
									</Text>
								</View>
							) : null}

							{view.destination.phone || maps ? (
								<View style={styles.tiles}>
									{view.destination.phone ? (
										<Tile
											icon="call"
											label={t("shipmentPanel.callBuyer")}
											onPress={() =>
												void Linking.openURL(
													telHref(view.destination.phone ?? ""),
												)
											}
										/>
									) : null}
									{maps ? (
										<Tile
											icon="navigate"
											label={t("shipmentPanel.openInMaps")}
											onPress={() => void Linking.openURL(maps)}
										/>
									) : null}
								</View>
							) : null}

							{view.allowedActions.some(
								(a) => a === "attempt" || a === "handover",
							) ? (
								<View
									style={[styles.notice, { backgroundColor: c.neutralSoft }]}
								>
									<Ionicons name="link" size={20} color={c.neutralText} />
									<Text style={[styles.noticeText, { color: c.neutralText }]}>
										{t("shipmentPanel.useLinkForDelivery")}
									</Text>
								</View>
							) : null}

							{pickUp.error ? (
								<View
									accessibilityRole="alert"
									style={[styles.notice, { backgroundColor: c.dangerSoft }]}
								>
									<Ionicons
										name="alert-circle"
										size={20}
										color={c.dangerText}
									/>
									<Text style={[styles.noticeText, { color: c.dangerText }]}>
										{resolveErrorMessage(pickUp.error, t)}
									</Text>
								</View>
							) : null}
						</ScrollView>
					</ScreenColumn>

					{canPickUp ? (
						<View
							style={[
								styles.bar,
								{
									backgroundColor: c.card,
									borderTopColor: c.border,
									paddingBottom: Math.max(insets.bottom, 12) + 4,
								},
							]}
						>
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={t("shipmentPanel.pickUp")}
								accessibilityState={{
									disabled: pickUp.isPending,
									busy: pickUp.isPending,
								}}
								disabled={pickUp.isPending}
								onPress={onPickUp}
								style={({ pressed }) => [
									styles.primary,
									{
										backgroundColor: k.primaryFill,
										opacity: pressed ? 0.88 : 1,
										transform: [{ scale: pressed ? 0.98 : 1 }],
									},
								]}
							>
								{pickUp.isPending ? (
									<ActivityIndicator color={k.onFill} />
								) : (
									<>
										<Ionicons name="cube" size={24} color={k.onFill} />
										<Text style={styles.primaryText}>
											{t("shipmentPanel.pickUp")}
										</Text>
									</>
								)}
							</Pressable>
						</View>
					) : null}
				</>
			)}
		</SafeAreaView>
	);
}

/** A large square-ish action for the middle of the screen. */
function Tile({
	icon,
	label,
	onPress,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	onPress: () => void;
}) {
	const c = useShopTheme();
	const k = moderationTones(c.isDark);
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			style={({ pressed }) => [
				styles.tile,
				{
					backgroundColor: c.card,
					borderColor: k.strongBorder,
					opacity: pressed ? 0.85 : 1,
					transform: [{ scale: pressed ? 0.98 : 1 }],
				},
			]}
		>
			<Ionicons name={icon} size={28} color={k.linkText} />
			<Text style={[styles.tileText, { color: c.text }]} numberOfLines={2}>
				{label}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	flex: { flex: 1 },
	content: { padding: 16, gap: 14, paddingBottom: 32 },
	status: {
		fontSize: 26,
		lineHeight: 31,
		letterSpacing: -0.5,
		fontFamily: Fonts.displayExtrabold,
	},
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 16,
	},
	line: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 12,
		paddingVertical: 14,
	},
	divided: { borderTopWidth: StyleSheet.hairlineWidth },
	recipient: {
		fontSize: 18,
		lineHeight: 23,
		fontFamily: Fonts.displayBold,
		marginBottom: 2,
	},
	address: { fontSize: 18, lineHeight: 25, fontFamily: Fonts.bodySemibold },
	body: { fontSize: 16, lineHeight: 23, fontFamily: Fonts.body },
	cashTag: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 14,
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	cashText: {
		flex: 1,
		color: Colors.light.sunForeground,
		fontSize: 20,
		lineHeight: 26,
		letterSpacing: -0.3,
		fontFamily: Fonts.displayExtrabold,
	},
	tiles: { flexDirection: "row", gap: 12 },
	tile: {
		flex: 1,
		minHeight: 96,
		borderRadius: 16,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		padding: 12,
	},
	tileText: {
		fontSize: 16,
		lineHeight: 20,
		fontFamily: Fonts.bodyBold,
		textAlign: "center",
	},
	notice: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 10,
		borderRadius: 12,
		padding: 14,
	},
	noticeText: {
		flex: 1,
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodyMedium,
	},
	bar: {
		paddingHorizontal: 16,
		paddingTop: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	primary: {
		minHeight: 60,
		borderRadius: 14,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		paddingHorizontal: 16,
	},
	primaryText: {
		color: "#ffffff",
		fontSize: 18,
		lineHeight: 23,
		fontFamily: Fonts.bodyBold,
	},
});
