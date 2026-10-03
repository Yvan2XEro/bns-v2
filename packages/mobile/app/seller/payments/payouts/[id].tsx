import { useLocalSearchParams } from "expo-router";
import {
	ActivityIndicator,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import { EmptyState } from "@/src/components/EmptyState";
import { PaymentsShell } from "@/src/components/payments/PaymentsShell";
import { PayoutStatusBadge } from "@/src/components/payments/PayoutStatusBadge";
import { useShopTheme } from "@/src/components/shop/theme";
import { useSellerPayout } from "@/src/hooks/useSellerPayments";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate, formatXaf } from "@/src/lib/orderMoney";
import { PAYOUT_STATUSES, type PayoutStatus } from "@/src/lib/paymentStatus";

function Line({
	label,
	value,
	c,
}: {
	label: string;
	value: string;
	c: ReturnType<typeof useShopTheme>;
}) {
	return (
		<View style={styles.row}>
			<Text style={[s.meta, { color: c.muted, flex: 1 }]}>{label}</Text>
			<Text style={[s.cardTitle, { color: c.text, fontSize: 14 }]}>
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
		return (
			<View style={styles.center}>
				<ActivityIndicator color={c.primary} />
			</View>
		);
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

	return (
		<ScrollView
			contentContainerStyle={styles.content}
			refreshControl={
				<RefreshControl
					refreshing={payout.isRefetching}
					onRefresh={() => payout.refetch()}
				/>
			}
		>
			<View
				style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<View style={styles.head}>
					<Text style={[s.cardTitle, { color: c.text, fontSize: 18 }]}>
						{formatXaf(detail.amount, locale)}
					</Text>
					<PayoutStatusBadge status={detail.status} />
				</View>
				<Line
					label={t("payments.seller_colDate")}
					value={formatOrderDate(detail.date, locale)}
					c={c}
				/>
				<Line
					label={t("payments.seller_colAmount")}
					value={formatXaf(detail.amount, locale)}
					c={c}
				/>
				{detail.fee > 0 ? (
					<Line
						label={t("payments.seller_colFee")}
						value={formatXaf(detail.fee, locale)}
						c={c}
					/>
				) : null}
				<Line
					label={t("payments.seller_colDestination")}
					value={detail.destinationMasked}
					c={c}
				/>
			</View>

			<View
				style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<Text style={[s.cardTitle, { color: c.text }]}>
					{t("payments.payout_orders")}
				</Text>
				{detail.orders.length === 0 ? (
					<Text style={[s.meta, { color: c.muted }]}>
						{t("payments.seller_noPayouts")}
					</Text>
				) : (
					detail.orders.map((order) => (
						<View key={order.orderId} style={styles.row}>
							<Text style={[s.meta, { color: c.body, flex: 1 }]}>
								{order.orderNumber}
							</Text>
							<Text style={[s.meta, { color: c.text }]}>
								{formatXaf(order.amount, locale)}
							</Text>
						</View>
					))
				)}
			</View>

			<View
				style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<Text style={[s.cardTitle, { color: c.text }]}>
					{t("payments.payout_history")}
				</Text>
				{detail.statusHistory.map((entry, index) => (
					<View key={`${entry.status}-${index}`} style={styles.row}>
						<Text style={[s.meta, { color: c.body, flex: 1 }]}>
							{t(PAYOUT_STATUSES[entry.status as PayoutStatus])}
						</Text>
						<Text style={[s.meta, { color: c.muted }]}>
							{formatOrderDate(entry.at, locale)}
						</Text>
					</View>
				))}
			</View>
		</ScrollView>
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
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	content: { padding: 16, gap: 12, paddingBottom: 32 },
	head: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 4,
	},
	row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
});
