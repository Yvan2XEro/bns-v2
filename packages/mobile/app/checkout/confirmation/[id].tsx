import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import type { ComponentProps } from "react";
import {
	ActivityIndicator,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { CheckoutButton } from "@/src/components/checkout/CheckoutButton";
import { useAppLocale } from "@/src/components/checkout/CheckoutProvider";
import { CodeEntry } from "@/src/components/checkout/CodeEntry";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { usePurchase } from "@/src/hooks/usePurchases";
import { resolveErrorMessage } from "@/src/lib/apiError";
import {
	confirmationOutcome,
	isConfirmationRequired,
} from "@/src/lib/checkoutFlow";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import { cityLabel, districtLabel } from "@/src/lib/sellerOrders";

/**
 * `c` carries the placement's `confirmationRequired`, so the right outcome
 * renders before the order loads; the order's own `confirmation.required`
 * takes over once it has, so a confirmed code moves the screen on.
 */
export default function CheckoutConfirmationScreen() {
	const { id, c: hint } = useLocalSearchParams<{ id: string; c?: string }>();
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useAppLocale();
	const purchase = usePurchase(id);
	const order = purchase.data;
	const outcome = confirmationOutcome(
		order?.confirmation.required ??
			(isConfirmationRequired(hint) ? hint : null),
	);
	const leave = () => router.replace("/(tabs)/home");
	const heroColor = outcome === "confirmed" ? c.success : c.primary;
	const heroSoft = outcome === "confirmed" ? c.successSoft : c.primarySoft;
	const total = order ? formatXaf(order.amounts.total, locale) : "";
	const place = order
		? [districtLabel(order.delivery), cityLabel(order.delivery.city)]
				.filter(Boolean)
				.join(", ")
		: "";

	return (
		<SafeAreaView
			edges={["top", "bottom"]}
			style={{ flex: 1, backgroundColor: c.bg }}
		>
			<SellerHeader title={t("checkout.title")} icon="close" onBack={leave} />
			{purchase.isPending ? (
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			) : !order ? (
				<EmptyState
					illustration="notFound"
					title={resolveErrorMessage(purchase.error, t)}
					ctaLabel={t("common.retry")}
					onCta={() => void purchase.refetch()}
				/>
			) : (
				<>
					<ScrollView contentContainerStyle={styles.scroll}>
						<View style={styles.hero}>
							<View style={[styles.halo, { backgroundColor: `${heroSoft}80` }]}>
								<View style={[styles.haloInner, { backgroundColor: heroSoft }]}>
									<Ionicons
										name={outcome === "confirmed" ? "checkmark" : "call"}
										size={34}
										color={heroColor}
									/>
								</View>
							</View>
							<Text style={[styles.title, { color: c.text }]}>
								{t("checkout.orderPlaced")}
							</Text>
							<Text style={[styles.number, { color: c.body }]}>
								{t("checkout.orderNumberLine", { number: order.orderNumber })}
							</Text>
						</View>
						<View
							style={[
								styles.card,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<InfoRow
								icon={
									outcome === "confirmed"
										? "checkmark-circle-outline"
										: "call-outline"
								}
								tone={outcome === "confirmed" ? "success" : "primary"}
								title={
									outcome === "confirmed"
										? t("checkout.confirmed")
										: outcome === "seller_call"
											? t("checkout.confirmationNeededCall")
											: t("checkout.confirmationNeededCode")
								}
								body={
									outcome === "confirmed"
										? order.confirmation.method === "verified_phone"
											? t("checkout.autoConfirmedBody")
											: t("checkout.confirmedBody")
										: outcome === "seller_call"
											? t("checkout.sellerCallBody")
											: t("checkout.codeBody")
								}
							/>
							{outcome === "code" ? (
								<CodeEntry
									order={order}
									onAttempt={() => void purchase.refetch()}
								/>
							) : null}
							<View style={[styles.divider, { backgroundColor: c.border }]} />
							<InfoRow
								icon="receipt-outline"
								tone="neutral"
								title={t("checkout.total")}
								body={
									order.paymentMethod === "cod"
										? t("checkout.payOnDelivery", { amount: total })
										: total
								}
							/>
						</View>
						<Text style={[styles.section, { color: c.text }]}>
							{t("checkout.nextTitle")}
						</Text>
						<NextSteps
							steps={[
								{
									title: t("checkout.nextAccept"),
									body: t("checkout.nextAcceptBody", { shop: order.shop.name }),
								},
								order.delivery.method === "pickup"
									? {
											title: t("checkout.nextPickup"),
											body: t("checkout.nextPickupBody"),
										}
									: {
											title: t("checkout.nextDelivery", { place }),
											body: t("checkout.nextDeliveryBody"),
										},
								{
									title: t("checkout.nextHandover"),
									body:
										order.paymentMethod === "cod"
											? t("checkout.nextHandoverCodBody", { amount: total })
											: t("checkout.nextHandoverPaidBody"),
								},
							]}
						/>
					</ScrollView>
					<View
						style={[
							styles.bar,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<CheckoutButton
							icon="cube-outline"
							label={t("checkout.trackOrder")}
							onPress={() =>
								router.replace({
									pathname: "/purchases/[id]",
									params: { id: order.id },
								})
							}
						/>
						{order.conversationId ? (
							<CheckoutButton
								variant="outline"
								icon="chatbubble-outline"
								label={t("checkout.writeToShop")}
								onPress={() =>
									router.replace(`/messages/${order.conversationId}`)
								}
							/>
						) : (
							<CheckoutButton
								variant="outline"
								label={t("checkout.continueShopping")}
								onPress={leave}
							/>
						)}
					</View>
				</>
			)}
		</SafeAreaView>
	);
}

type Tone = "success" | "primary" | "neutral";

function InfoRow({
	icon,
	tone,
	title,
	body,
}: {
	icon: ComponentProps<typeof Ionicons>["name"];
	tone: Tone;
	title: string;
	body: string;
}) {
	const c = useShopTheme();
	const tile = {
		success: [c.successSoft, c.success],
		primary: [c.primarySoft, c.primary],
		neutral: [c.neutralSoft, c.neutralText],
	}[tone];
	return (
		<View style={styles.infoRow}>
			<View style={[styles.infoTile, { backgroundColor: tile[0] }]}>
				<Ionicons name={icon} size={20} color={tile[1]} />
			</View>
			<View style={{ flex: 1, gap: 2 }}>
				<Text style={[styles.infoTitle, { color: c.text }]}>{title}</Text>
				<Text style={[styles.infoBody, { color: c.muted }]}>{body}</Text>
			</View>
		</View>
	);
}

/** Numbered steps on a rail; the first is the one under way. */
function NextSteps({ steps }: { steps: { title: string; body: string }[] }) {
	const c = useShopTheme();
	return (
		<View>
			{steps.map((step, index) => {
				const current = index === 0;
				const last = index === steps.length - 1;
				return (
					<View key={step.title} style={styles.step}>
						<View style={styles.rail}>
							<View
								style={[
									styles.dot,
									current
										? { backgroundColor: c.primary, borderColor: c.primary }
										: { backgroundColor: c.card, borderColor: c.border },
								]}
							>
								<Text
									style={[
										styles.dotText,
										{ color: current ? "#fff" : c.muted },
									]}
								>
									{index + 1}
								</Text>
							</View>
							{last ? null : (
								<View style={[styles.line, { backgroundColor: c.border }]} />
							)}
						</View>
						<View style={styles.stepText}>
							<Text
								style={[
									styles.stepTitle,
									{ color: current ? c.primary : c.text },
								]}
							>
								{step.title}
							</Text>
							<Text style={[styles.infoBody, { color: c.muted }]}>
								{step.body}
							</Text>
						</View>
					</View>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	scroll: { padding: 16, gap: 16, paddingBottom: 24 },
	hero: { alignItems: "center", gap: 6, paddingTop: 8 },
	halo: {
		width: 96,
		height: 96,
		borderRadius: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	haloInner: {
		width: 72,
		height: 72,
		borderRadius: 36,
		alignItems: "center",
		justifyContent: "center",
	},
	title: {
		fontSize: 26,
		fontFamily: Fonts.displayExtrabold,
		textAlign: "center",
		marginTop: 10,
	},
	meta: { fontSize: 14, fontFamily: Fonts.body },
	number: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	card: {
		borderWidth: 1,
		borderRadius: 16,
		padding: 14,
		gap: 12,
	},
	divider: { height: StyleSheet.hairlineWidth },
	infoRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
	infoTile: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	infoTitle: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	infoBody: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 18 },
	section: { fontSize: 17, fontFamily: Fonts.displayBold, marginTop: 4 },
	step: { flexDirection: "row", gap: 12 },
	rail: { alignItems: "center", width: 28 },
	dot: {
		width: 28,
		height: 28,
		borderRadius: 14,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
	},
	dotText: { fontSize: 13, fontFamily: Fonts.displayBold },
	line: { flex: 1, width: 2, marginVertical: 2 },
	stepText: { flex: 1, gap: 2, paddingBottom: 16, paddingTop: 3 },
	stepTitle: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	bar: {
		padding: 16,
		gap: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
});
