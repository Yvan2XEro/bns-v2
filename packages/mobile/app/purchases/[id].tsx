import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import {
	ActionBar,
	type PurchaseSheet,
} from "@/src/components/purchases/ActionBar";
import { CancelSheet } from "@/src/components/purchases/CancelSheet";
import { ConfirmCodeCard } from "@/src/components/purchases/ConfirmCodeCard";
import { ConfirmReceiptSheet } from "@/src/components/purchases/ConfirmReceiptSheet";
import { ContestSheet } from "@/src/components/purchases/ContestSheet";
import { HandoverCard } from "@/src/components/purchases/HandoverCard";
import { PaymentSection } from "@/src/components/purchases/PaymentSection";
import { PurchaseSummary } from "@/src/components/purchases/PurchaseSummary";
import { ReviewPanel } from "@/src/components/purchases/ReviewPanel";
import { Timeline } from "@/src/components/purchases/Timeline";
import { WithdrawalWindowNote } from "@/src/components/purchases/WithdrawalWindowNote";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useNow } from "@/src/hooks/useNow";
import { usePurchase } from "@/src/hooks/usePurchases";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { availableActions, type OrderAction } from "@/src/lib/orderActions";
import { formatOrderDate } from "@/src/lib/orderMoney";
import { purchaseStatusKey } from "@/src/lib/purchaseActions";

export default function PurchaseScreen() {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const { id } = useLocalSearchParams<{ id: string }>();
	const purchase = usePurchase(id);
	const config = useAppConfig();
	const now = useNow();
	const [sheet, setSheet] = useState<PurchaseSheet | null>(null);

	const order = purchase.data;
	const actions = order ? availableActions(order, "buyer", null, { now }) : [];
	const has = (action: OrderAction) => actions.includes(action);
	const sheetProps = (name: PurchaseSheet) => ({
		visible: sheet === name && has(name),
		onClose: () => setSheet(null),
	});

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={
					order
						? t("purchases.orderNumber", { number: order.orderNumber })
						: t("purchases.title")
				}
				subtitle={
					order ? t("purchases.soldBy", { shop: order.shop.name }) : null
				}
				onBack={() =>
					router.canGoBack() ? router.back() : router.replace("/purchases")
				}
			/>

			{purchase.isPending ? (
				<View style={styles.center}>
					<ActivityIndicator color={c.primary} />
				</View>
			) : purchase.isError || !order ? (
				<EmptyState
					illustration="notFound"
					title={t("purchases.loadError")}
					subtitle={
						purchase.error ? resolveErrorMessage(purchase.error, t) : undefined
					}
					ctaLabel={t("purchases.retry")}
					onCta={() => void purchase.refetch()}
				/>
			) : (
				<ScrollView
					contentContainerStyle={styles.content}
					refreshControl={
						<RefreshControl
							refreshing={purchase.isRefetching}
							onRefresh={() => void purchase.refetch()}
							tintColor={c.primary}
						/>
					}
				>
					<View style={styles.heading}>
						<View style={[styles.pill, { backgroundColor: c.primarySoft }]}>
							<Text style={[styles.pillText, { color: c.primary }]}>
								{t(purchaseStatusKey(order.status))}
							</Text>
						</View>
						<Text style={[styles.meta, { color: c.muted }]}>
							{t("purchases.placedOn", {
								date: formatOrderDate(order.timestamps.placedAt, lang),
							})}
						</Text>
					</View>

					<ActionBar order={order} actions={actions} onSheet={setSheet} />
					{config.disputesEnabled && has("contest_delivery") ? (
						<Pressable
							accessibilityRole="button"
							onPress={() =>
								router.push({
									pathname: "/purchases/[id]/problem",
									params: { id: order.id },
								})
							}
							style={[styles.link, { borderColor: c.border }]}
						>
							<Ionicons name="warning-outline" size={18} color={c.primary} />
							<Text style={[styles.linkText, { color: c.primary }]}>
								{t("purchases.reportProblem")}
							</Text>
						</Pressable>
					) : null}

					{has("confirm_code") || has("resend_code") ? (
						<ConfirmCodeCard
							orderId={order.id}
							canConfirm={has("confirm_code")}
							canResend={has("resend_code")}
						/>
					) : null}

					{order.status === "shipped" ? (
						<HandoverCard order={order} actions={actions} />
					) : null}

					<WithdrawalWindowNote order={order} now={now} />

					{has("review_shop") ? (
						<ReviewPanel orderId={order.id} shopName={order.shop.name} />
					) : null}

					{order.conversationId ? (
						<Pressable
							onPress={() => router.push(`/messages/${order.conversationId}`)}
							accessibilityRole="button"
							accessibilityLabel={t("purchases.openConversation")}
							style={[styles.link, { borderColor: c.border }]}
						>
							<Ionicons
								name="chatbubbles-outline"
								size={18}
								color={c.primary}
							/>
							<Text style={[styles.linkText, { color: c.primary }]}>
								{t("purchases.openConversation")}
							</Text>
						</Pressable>
					) : null}

					<PaymentSection order={order} />
					<PurchaseSummary order={order} />
					<Timeline entries={order.timeline} />
				</ScrollView>
			)}

			{order ? (
				<>
					<CancelSheet orderId={order.id} {...sheetProps("cancel")} />
					<ConfirmReceiptSheet
						order={order}
						{...sheetProps("confirm_receipt")}
					/>
					<ContestSheet order={order} {...sheetProps("contest_delivery")} />
				</>
			) : null}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	content: { padding: 16, gap: 14, paddingBottom: 48 },
	heading: { flexDirection: "row", alignItems: "center", gap: 10 },
	pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
	pillText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	meta: { fontSize: 13, fontFamily: Fonts.body },
	link: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
	},
	linkText: { fontSize: 15, fontFamily: Fonts.bodySemibold },
});
