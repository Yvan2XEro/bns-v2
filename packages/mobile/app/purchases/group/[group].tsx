import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useAppLocale } from "@/src/components/checkout/CheckoutProvider";
import { fillOf, inkOf } from "@/src/components/checkout/fill";
import { OrderListSkeleton } from "@/src/components/checkout/OrderListSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useCheckoutGroup } from "@/src/hooks/useCheckoutGroup";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { checkoutGroupFlow, type OrderStep } from "@/src/lib/checkoutGroupFlow";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { CheckoutGroupOrderView } from "../../../../api/src/contracts/checkoutGroup";

export default function CheckoutGroupScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useAppLocale();
	const { group } = useLocalSearchParams<{ group: string }>();
	const query = useCheckoutGroup(group);
	const { refetch } = query;

	useFocusEffect(
		useCallback(() => {
			void refetch();
		}, [refetch]),
	);

	const flow = query.data ? checkoutGroupFlow(query.data) : null;
	const stateOf = new Map(flow?.steps.map((s) => [s.orderId, s.state]));

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("checkoutGroup.groupScreenTitle")} />
			{query.isPending ? (
				<OrderListSkeleton rows={3} />
			) : query.isError || !query.data || !flow ? (
				<EmptyState
					illustration="notFound"
					title={
						query.error
							? resolveErrorMessage(query.error, t)
							: t("checkoutGroup.groupLoadFailed")
					}
					ctaLabel={t("common.retry")}
					onCta={() => void refetch()}
				/>
			) : (
				<ScreenColumn width="wide">
					<FlashList<CheckoutGroupOrderView>
						data={query.data.orders}
						keyExtractor={(order) => order.id}
						contentContainerStyle={styles.list}
						ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
						ListHeaderComponent={
							<View style={styles.header}>
								{flow.position ? (
									<Text
										style={[styles.step, { color: c.text }]}
										accessibilityRole="header"
									>
										{t("checkoutGroup.stepperPosition", {
											n: flow.position.n,
											total: flow.position.total,
										})}
									</Text>
								) : null}
								<Text style={[styles.meta, { color: c.muted }]}>
									{t("checkoutGroup.summaryPaid", {
										count: flow.summary.paid,
									})}
									{" · "}
									{t("checkoutGroup.summaryExpired", {
										count: flow.summary.expired,
									})}
									{" · "}
									{t("checkoutGroup.summaryPending", {
										count: flow.summary.pending,
									})}
								</Text>
							</View>
						}
						renderItem={({ item: order }) => (
							<OrderCard
								order={order}
								step={stateOf.get(order.id)}
								isNext={flow.next === order.id}
								locale={locale}
							/>
						)}
					/>
				</ScreenColumn>
			)}
		</SafeAreaView>
	);
}

function OrderCard({
	order,
	step,
	isNext,
	locale,
}: {
	order: CheckoutGroupOrderView;
	step: OrderStep | undefined;
	isNext: boolean;
	locale: "fr" | "en";
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const number = t("purchases.orderNumber", { number: order.orderNumber });
	const fill = fillOf(c);
	const ink = inkOf(c);

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.row}>
				<Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
					{order.shop.name}
				</Text>
				<Text style={[styles.price, { color: c.text }]}>
					{formatPrice(order.total, locale)}
				</Text>
			</View>
			<Text style={[styles.meta, { color: c.muted }]}>{number}</Text>
			{step === "paid" ? (
				<View style={styles.state}>
					<Ionicons name="checkmark-circle" size={16} color={c.successText} />
					<Text style={[styles.stateText, { color: c.successText }]}>
						{t("checkoutGroup.summaryPaid", { count: 1 })}
					</Text>
				</View>
			) : null}
			{step === "expired" ? (
				<View style={styles.state}>
					<Ionicons name="time-outline" size={16} color={c.dangerText} />
					<Text style={[styles.stateText, { color: c.dangerText }]}>
						{t("checkoutGroup.summaryExpired", { count: 1 })}
					</Text>
				</View>
			) : null}
			{order.payableNow ? (
				<>
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("checkoutGroup.payNoCode")}
					</Text>
					<Pressable
						onPress={() =>
							router.push({
								pathname: "/checkout/[orderId]/pay",
								params: { orderId: order.id },
							})
						}
						accessibilityRole="button"
						accessibilityLabel={t("checkoutGroup.payThisOrder", {
							orderNumber: order.orderNumber,
						})}
						style={({ pressed }) => [
							styles.button,
							{
								backgroundColor: isNext ? fill.bg : c.card,
								borderColor: isNext ? fill.bg : c.border,
								opacity: pressed ? 0.85 : 1,
							},
						]}
					>
						<Text
							style={[styles.buttonText, { color: isNext ? fill.fg : ink }]}
						>
							{t("checkoutGroup.payThisOrder", {
								orderNumber: order.orderNumber,
							})}
						</Text>
					</Pressable>
				</>
			) : null}
			<Pressable
				onPress={() => router.push(`/purchases/${order.id}`)}
				accessibilityRole="button"
				accessibilityLabel={t("checkoutGroup.viewOrder", {
					orderNumber: order.orderNumber,
				})}
				style={styles.link}
			>
				<Text style={[styles.linkText, { color: ink }]}>
					{t("checkoutGroup.viewOrder", { orderNumber: order.orderNumber })}
				</Text>
				<Ionicons name="chevron-forward" size={16} color={ink} />
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	list: { padding: 16 },
	header: { gap: 4, marginBottom: 16 },
	step: { fontSize: 20, lineHeight: 25, fontFamily: Fonts.displayBold },
	meta: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.body },
	card: {
		padding: 16,
		gap: 8,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 12,
	},
	title: { flex: 1, fontSize: 16, fontFamily: Fonts.bodySemibold },
	price: {
		fontSize: 18,
		fontFamily: Fonts.displayExtrabold,
		fontVariant: ["tabular-nums"],
	},
	state: { flexDirection: "row", alignItems: "center", gap: 6 },
	stateText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	button: {
		minHeight: 52,
		marginTop: 4,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	buttonText: { fontSize: 16, fontFamily: Fonts.bodyBold, textAlign: "center" },
	link: {
		minHeight: 44,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	linkText: { fontSize: 15, fontFamily: Fonts.bodySemibold },
});
