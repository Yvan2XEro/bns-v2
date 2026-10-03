import { FlashList } from "@shopify/flash-list";
import {
	ActivityIndicator,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { EmptyState } from "@/src/components/EmptyState";
import { AmountsCard } from "@/src/components/payments/AmountsCard";
import { HoldsList } from "@/src/components/payments/HoldsList";
import { PaymentsOrderRow } from "@/src/components/payments/PaymentsOrderRow";
import { PaymentsShell } from "@/src/components/payments/PaymentsShell";
import { PayoutRow } from "@/src/components/payments/PayoutRow";
import { StatusRow } from "@/src/components/payments/StatusRow";
import { useShopTheme } from "@/src/components/shop/theme";
import {
	useSellerPaymentSetup,
	useSellerPayments,
} from "@/src/hooks/useSellerPayments";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type { SellerPaymentsOrderRow } from "@/src/types/order";

function PaymentsContent({ shopId }: { shopId: string }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const payments = useSellerPayments(shopId);
	const setup = useSellerPaymentSetup(shopId);
	const refresh = () => {
		payments.refetch();
		setup.refetch();
	};

	if (payments.isPending) {
		return (
			<View style={styles.center}>
				<ActivityIndicator color={c.primary} />
			</View>
		);
	}
	if (payments.isError) {
		return (
			<EmptyState
				illustration="notFound"
				title={t("payments.seller_title")}
				subtitle={resolveErrorMessage(payments.error, t)}
				ctaLabel={t("common.retry")}
				onCta={refresh}
			/>
		);
	}

	const view = payments.data;
	const header = (
		<View style={styles.header}>
			<StatusRow setup={setup.data} holdsCount={view.holds.length} />
			<AmountsCard amounts={view.amounts} />
			<View
				style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<Text style={[s.cardTitle, { color: c.text }]}>
					{t("payments.seller_statusHolds")}
				</Text>
				<HoldsList holds={view.holds} />
			</View>
			<Text style={[s.cardTitle, { color: c.text }]}>
				{t("payments.seller_payoutsTitle")}
			</Text>
			{view.payouts.length === 0 ? (
				<Text style={[s.meta, { color: c.muted }]}>
					{t("payments.seller_noPayouts")}
				</Text>
			) : (
				<View style={styles.payouts}>
					{view.payouts.map((payout) => (
						<PayoutRow key={payout.id} payout={payout} />
					))}
				</View>
			)}
			<Text style={[s.cardTitle, { color: c.text, marginTop: 4 }]}>
				{t("payments.seller_ordersTitle")}
			</Text>
		</View>
	);

	return (
		<FlashList<SellerPaymentsOrderRow>
			data={view.orders}
			keyExtractor={(order) => order.orderId}
			ListHeaderComponent={header}
			ItemSeparatorComponent={() => <View style={styles.separator} />}
			renderItem={({ item }) => <PaymentsOrderRow order={item} />}
			contentContainerStyle={styles.list}
			refreshControl={
				<RefreshControl
					refreshing={payments.isRefetching}
					onRefresh={refresh}
				/>
			}
		/>
	);
}

export default function SellerPaymentsScreen() {
	const { t } = useTranslation();
	return (
		<PaymentsShell title={t("payments.seller_title")}>
			{({ shopId }) => <PaymentsContent shopId={shopId} />}
		</PaymentsShell>
	);
}

const styles = StyleSheet.create({
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	list: { padding: 16, paddingBottom: 32 },
	header: { gap: 12, marginBottom: 12 },
	payouts: { gap: 10 },
	separator: { height: 10 },
});
