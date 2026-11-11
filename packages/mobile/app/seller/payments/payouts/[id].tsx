import { useLocalSearchParams } from "expo-router";
import {
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import { DetailSkeleton } from "@/src/components/checkout/DetailSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { PaymentsShell } from "@/src/components/payments/PaymentsShell";
import { PayoutStatusBadge } from "@/src/components/payments/PayoutStatusBadge";
import { AmountTag } from "@/src/components/shop/Tags";
import { type ShopPalette, useShopTheme } from "@/src/components/shop/theme";
import { useSellerPayout } from "@/src/hooks/useSellerPayments";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { formatOrderDate } from "@/src/lib/orderMoney";
import { PAYOUT_STATUSES, type PayoutStatus } from "@/src/lib/paymentStatus";

/**
 * One label/value line of a detail card. `numeric` sets the value in Outfit,
 * the face the app gives to amounts and counts.
 */
function Line({
	label,
	value,
	c,
	numeric = false,
	first = false,
}: {
	label: string;
	value: string;
	c: ShopPalette;
	numeric?: boolean;
	first?: boolean;
}) {
	return (
		<View
			style={[
				styles.line,
				!first && {
					borderTopWidth: StyleSheet.hairlineWidth,
					borderTopColor: c.border,
				},
			]}
		>
			<Text style={[styles.lineLabel, { color: c.muted }]}>{label}</Text>
			<Text
				style={[
					numeric ? styles.lineNumber : styles.lineValue,
					{ color: c.text },
				]}
				numberOfLines={1}
			>
				{value}
			</Text>
		</View>
	);
}

function PayoutDetailContent({
	shopId,
	payoutId,
}: {
	shopId: string;
	payoutId: string | undefined;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useLocaleKey();
	const payout = useSellerPayout(shopId, payoutId);

	if (payout.isPending) {
		return <DetailSkeleton cards={2} />;
	}
	if (payout.isError) {
		return (
			<EmptyState
				illustration="notFound"
				title={t("payments.payout_title")}
				subtitle={resolveErrorMessage(payout.error, t)}
				ctaLabel={t("common.retry")}
				onCta={() => payout.refetch()}
			/>
		);
	}

	const detail = payout.data;
	if (!detail) {
		return (
			<EmptyState
				illustration="notFound"
				title={t("payments.payout_notFound")}
			/>
		);
	}

	const card = [s.card, { backgroundColor: c.card, borderColor: c.border }];

	return (
		<ScreenColumn width="reading">
			<ScrollView
				contentContainerStyle={styles.content}
				refreshControl={
					<RefreshControl
						refreshing={payout.isRefetching}
						onRefresh={() => payout.refetch()}
						tintColor={c.primary}
						colors={[c.primary]}
					/>
				}
			>
				<View style={card}>
					<View style={styles.head}>
						<View
							accessible
							accessibilityLabel={`${t("payments.seller_colAmount")}: ${formatPrice(detail.amount, locale)}`}
						>
							<AmountTag label={formatPrice(detail.amount, locale)} size="lg" />
						</View>
						<PayoutStatusBadge status={detail.status} />
					</View>
					<View style={styles.lines}>
						<Line
							first
							label={t("payments.seller_colDate")}
							value={formatOrderDate(detail.date, locale)}
							c={c}
						/>
						{detail.fee > 0 ? (
							<Line
								label={t("payments.seller_colFee")}
								value={formatPrice(detail.fee, locale)}
								c={c}
								numeric
							/>
						) : null}
						<Line
							label={t("payments.seller_colDestination")}
							value={detail.destinationMasked}
							c={c}
						/>
					</View>
				</View>

				{detail.orders.length > 0 ? (
					<View style={card}>
						<Text
							accessibilityRole="header"
							style={[s.cardTitle, { color: c.text }]}
						>
							{t("payments.payout_orders")}
						</Text>
						<View style={styles.lines}>
							{detail.orders.map((order, index) => (
								<Line
									key={order.orderId}
									first={index === 0}
									label={order.orderNumber}
									value={formatPrice(order.amount, locale)}
									c={c}
									numeric
								/>
							))}
						</View>
					</View>
				) : null}

				{detail.statusHistory.length > 0 ? (
					<View style={card}>
						<Text
							accessibilityRole="header"
							style={[s.cardTitle, { color: c.text }]}
						>
							{t("payments.payout_history")}
						</Text>
						<View style={styles.lines}>
							{detail.statusHistory.map((entry, index) => (
								<Line
									key={`${entry.status}-${index}`}
									first={index === 0}
									label={t(PAYOUT_STATUSES[entry.status as PayoutStatus])}
									value={formatOrderDate(entry.at, locale)}
									c={c}
								/>
							))}
						</View>
					</View>
				) : null}
			</ScrollView>
		</ScreenColumn>
	);
}

export default function SellerPayoutScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const { t } = useTranslation();
	return (
		<PaymentsShell title={t("payments.payout_title")}>
			{({ shopId }) => <PayoutDetailContent shopId={shopId} payoutId={id} />}
		</PaymentsShell>
	);
}

const styles = StyleSheet.create({
	content: { padding: 16, gap: 12, paddingBottom: 32 },
	head: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		flexWrap: "wrap",
		gap: 8,
		marginBottom: 6,
	},
	lines: { marginTop: 2 },
	line: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 44,
		paddingVertical: 8,
	},
	lineLabel: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	lineValue: {
		fontSize: 14,
		lineHeight: 20,
		fontFamily: Fonts.bodySemibold,
		flexShrink: 1,
		textAlign: "right",
	},
	lineNumber: {
		fontSize: 15,
		lineHeight: 20,
		fontFamily: Fonts.displaySemibold,
		letterSpacing: -0.1,
		fontVariant: ["tabular-nums"],
	},
});
