import { FlashList } from "@shopify/flash-list";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useAppLocale } from "@/src/components/checkout/CheckoutProvider";
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
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
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
									<Text style={[styles.step, { color: c.text }]}>
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

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.row}>
				<Text style={[styles.title, { color: c.text }]}>{order.shop.name}</Text>
				<Text style={[styles.title, { color: c.text }]}>
					{formatPrice(order.total, locale)}
				</Text>
			</View>
			<Text style={[styles.meta, { color: c.muted }]}>{number}</Text>
			{step === "paid" ? (
				<Text style={[styles.meta, { color: c.primary }]}>
					{t("checkoutGroup.summaryPaid", { count: 1 })}
				</Text>
			) : null}
			{step === "expired" ? (
				<Text style={[styles.meta, { color: c.dangerText }]}>
					{t("checkoutGroup.summaryExpired", { count: 1 })}
				</Text>
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
						style={[
							styles.button,
							{
								backgroundColor: isNext ? c.primary : c.card,
								borderColor: c.primary,
							},
						]}
					>
						<Text
							style={[
								styles.buttonText,
								{ color: isNext ? "#fff" : c.primary },
							]}
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
				<Text style={[styles.buttonText, { color: c.primary }]}>
					{t("checkoutGroup.viewOrder", { orderNumber: order.orderNumber })}
				</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	list: { padding: 16 },
	header: { gap: 4, marginBottom: 12 },
	step: { fontSize: 16, fontFamily: Fonts.displayBold },
	meta: { fontSize: 13, fontFamily: Fonts.body },
	card: {
		padding: 14,
		gap: 8,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	title: { fontSize: 15, fontFamily: Fonts.displayBold },
	button: {
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	buttonText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	link: { minHeight: 44, justifyContent: "center" },
});
