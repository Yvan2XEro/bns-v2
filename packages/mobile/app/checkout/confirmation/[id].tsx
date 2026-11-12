import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { type ComponentProps, useEffect, useRef } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { CheckoutButton } from "@/src/components/checkout/CheckoutButton";
import { useAppLocale } from "@/src/components/checkout/CheckoutProvider";
import { CodeEntry } from "@/src/components/checkout/CodeEntry";
import { DetailSkeleton } from "@/src/components/checkout/DetailSkeleton";
import { fillOf, inkOf } from "@/src/components/checkout/fill";
import { TotalTag } from "@/src/components/checkout/TotalTag";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { usePurchase } from "@/src/hooks/usePurchases";
import { useShareReceipt } from "@/src/hooks/useShareReceipt";
import { resolveErrorMessage } from "@/src/lib/apiError";
import {
	confirmationOutcome,
	isConfirmationRequired,
} from "@/src/lib/checkoutFlow";
import { hapticOutcome } from "@/src/lib/haptics";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
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
	// Felt when the order is actually through: at once for a confirmed one,
	// or the moment a code moves it to confirmed.
	const feltRef = useRef(false);
	const confirmedNow = outcome === "confirmed" && Boolean(order);
	useEffect(() => {
		if (!confirmedNow || feltRef.current) return;
		feltRef.current = true;
		hapticOutcome("success");
	}, [confirmedNow]);
	// With a code to type, the two pinned buttons would sit on the keyboard
	// over the field; they move into the scroll instead.
	const pinned = outcome !== "code";
	const heroColor = outcome === "confirmed" ? c.successText : inkOf(c);
	const heroSoft = outcome === "confirmed" ? c.successSoft : c.primarySoft;
	const total = order ? formatPrice(order.amounts.total, locale) : "";
	const place = order
		? [districtLabel(order.delivery), cityLabel(order.delivery.city)]
				.filter(Boolean)
				.join(", ")
		: "";
	const actions = order ? (
		<>
			<CheckoutButton
				icon="cube-outline"
				// While a code is owed, confirming it is the screen's one
				// filled action; tracking steps back to a quiet button.
				variant={outcome === "code" ? "outline" : "primary"}
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
					onPress={() => router.replace(`/messages/${order.conversationId}`)}
				/>
			) : (
				<CheckoutButton
					variant="outline"
					label={t("checkout.continueShopping")}
					onPress={leave}
				/>
			)}
		</>
	) : null;

	return (
		<SafeAreaView
			edges={["top", "bottom"]}
			style={{ flex: 1, backgroundColor: c.bg }}
		>
			<SellerHeader title={t("checkout.title")} icon="close" onBack={leave} />
			{purchase.isPending ? (
				<DetailSkeleton cards={2} />
			) : !order ? (
				<EmptyState
					illustration="notFound"
					title={resolveErrorMessage(purchase.error, t)}
					ctaLabel={t("common.retry")}
					onCta={() => void purchase.refetch()}
				/>
			) : (
				<>
					<ScreenColumn width="reading">
						<KeyboardAwareScrollView
							contentContainerStyle={styles.scroll}
							keyboardShouldPersistTaps="handled"
							bottomOffset={24}
						>
							<View style={styles.hero}>
								<View style={[styles.heroTile, { backgroundColor: heroSoft }]}>
									<Ionicons
										name={outcome === "confirmed" ? "checkmark" : "call"}
										size={34}
										color={heroColor}
									/>
								</View>
								<Text
									style={[styles.title, { color: c.text }]}
									accessibilityRole="header"
								>
									{outcome === "confirmed"
										? t("checkout.orderPlaced")
										: t("checkout.oneMoreStep")}
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
								<View
									style={styles.totalRow}
									accessible
									accessibilityLabel={`${t("checkout.total")} ${total}`}
								>
									<Text style={[styles.totalLabel, { color: c.text }]}>
										{t("checkout.total")}
									</Text>
									<TotalTag amount={total} />
								</View>
								<View style={[styles.divider, { backgroundColor: c.border }]} />
								<ReceiptRow
									order={order}
									total={
										order.paymentMethod === "cod"
											? t("checkout.payOnDelivery", { amount: total })
											: total
									}
								/>
							</View>
							<Text
								style={[styles.section, { color: c.text }]}
								accessibilityRole="header"
							>
								{t("checkout.nextTitle")}
							</Text>
							<NextSteps
								steps={[
									{
										title: t("checkout.nextAccept"),
										body: t("checkout.nextAcceptBody", {
											shop: order.shop.name,
										}),
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
							{pinned ? null : <View style={styles.inline}>{actions}</View>}
						</KeyboardAwareScrollView>
					</ScreenColumn>
					{pinned ? (
						<View
							style={[
								styles.bar,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							{actions}
						</View>
					) : null}
				</>
			)}
		</SafeAreaView>
	);
}

/** The same receipt the order detail shares, opened from the placed screen. */
function ReceiptRow({
	order,
	total,
}: {
	order: { id: string; orderNumber: string };
	total: string;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const { showError } = useAlert();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const receipt = useShareReceipt(order, lang);
	const open = () => {
		receipt
			.share()
			.catch((error: unknown) =>
				showError(
					t("purchases.receiptUnavailable"),
					resolveErrorMessage(error, t),
				),
			);
	};
	return (
		<Pressable
			onPress={open}
			disabled={receipt.pending}
			accessibilityRole="button"
			accessibilityLabel={t("checkout.receiptRowLabel")}
			accessibilityState={{ busy: receipt.pending }}
			style={styles.receiptRow}
		>
			<View style={{ flex: 1 }}>
				<InfoRow
					icon="document-text-outline"
					tone="neutral"
					title={t("checkout.receiptRow")}
					body={t("checkout.receiptRowBody", { total })}
				/>
			</View>
			{receipt.pending ? (
				<ActivityIndicator color={c.primary} />
			) : (
				<Ionicons name="chevron-forward" size={18} color={c.muted} />
			)}
		</Pressable>
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
				<Text style={[styles.infoBody, { color: c.body }]}>{body}</Text>
			</View>
		</View>
	);
}

/** Numbered steps on a rail; the first is the one under way. */
function NextSteps({ steps }: { steps: { title: string; body: string }[] }) {
	const c = useShopTheme();
	const fill = fillOf(c);
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
										? { backgroundColor: fill.bg, borderColor: fill.bg }
										: { backgroundColor: c.card, borderColor: c.border },
								]}
							>
								<Text
									style={[
										styles.dotText,
										{ color: current ? fill.fg : c.muted },
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
									{ color: current ? inkOf(c) : c.text },
								]}
							>
								{step.title}
							</Text>
							<Text style={[styles.infoBody, { color: c.body }]}>
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
	heroTile: {
		width: 72,
		height: 72,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	title: {
		fontSize: 30,
		lineHeight: 36,
		letterSpacing: -0.6,
		fontFamily: Fonts.displayExtrabold,
		textAlign: "center",
		marginTop: 10,
	},
	totalRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	totalLabel: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.displayBold },
	meta: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	number: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	card: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		padding: 16,
		gap: 14,
	},
	divider: { height: StyleSheet.hairlineWidth },
	receiptRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minHeight: 48,
	},
	infoRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
	infoTile: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	infoTitle: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	infoBody: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 22 },
	section: {
		fontSize: 20,
		lineHeight: 25,
		fontFamily: Fonts.displayBold,
		marginTop: 8,
	},
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
	dotText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.displayBold },
	line: { flex: 1, width: 2, marginVertical: 2 },
	stepText: { flex: 1, gap: 2, paddingBottom: 16, paddingTop: 3 },
	stepTitle: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	inline: { gap: 10, marginTop: 8 },
	bar: {
		padding: 16,
		gap: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
});
