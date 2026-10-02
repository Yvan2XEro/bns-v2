import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { BillingShell } from "@/src/components/billing/BillingShell";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { CurrentPeriodCard } from "@/src/components/billing/CurrentPeriodCard";
import { InvoiceRow } from "@/src/components/billing/InvoiceRow";
import { RestrictionBanner } from "@/src/components/billing/RestrictionBanner";
import { EmptyState } from "@/src/components/EmptyState";
import { useShopTheme } from "@/src/components/shop/theme";
import { useBilling } from "@/src/hooks/useBilling";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { isPayable } from "@/src/lib/billing";
import { useTranslation } from "@/src/lib/i18n";
import type { CommissionInvoiceView } from "@/src/types/order";

function BillingContent({ shopId }: { shopId: string }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const billing = useBilling(shopId);
	const refresh = () => {
		billing.refetch();
	};

	if (billing.isPending) {
		return (
			<View style={styles.center}>
				<ActivityIndicator color={c.primary} />
			</View>
		);
	}
	if (billing.isError) {
		return (
			<EmptyState
				illustration="notFound"
				title={t("billing.loadError")}
				subtitle={resolveErrorMessage(billing.error, t)}
				ctaLabel={t("common.retry")}
				onCta={refresh}
			/>
		);
	}

	const view = billing.data;
	const hasPayable = view.invoices.some((invoice) => isPayable(invoice.status));

	const header = (
		<View style={styles.header}>
			{view.restricted ? (
				<RestrictionBanner restricted={view.restricted} />
			) : null}
			<CurrentPeriodCard period={view.currentPeriod} />
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("billing.orderSettingsTitle")}
				onPress={() => router.push("/seller/order-settings")}
				style={[
					s.card,
					styles.link,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<Ionicons name="options-outline" size={20} color={c.primary} />
				<Text style={[s.cardTitle, { color: c.text, flex: 1 }]}>
					{t("billing.orderSettingsTitle")}
				</Text>
				<Ionicons name="chevron-forward" size={18} color={c.muted} />
			</Pressable>
			<Text style={[s.cardTitle, { color: c.text, marginTop: 4 }]}>
				{t("billing.invoicesTitle")}
			</Text>
			{hasPayable ? (
				<Text style={[s.meta, { color: c.muted }]}>{t("billing.payHint")}</Text>
			) : null}
		</View>
	);

	return (
		<FlashList<CommissionInvoiceView>
			data={view.invoices}
			keyExtractor={(invoice) => invoice.id}
			ListHeaderComponent={header}
			ListEmptyComponent={
				<Text
					style={[
						s.body,
						styles.empty,
						{ color: c.muted, borderColor: c.border },
					]}
				>
					{t("billing.noInvoices")}
				</Text>
			}
			ItemSeparatorComponent={() => <View style={styles.separator} />}
			renderItem={({ item }) => (
				<InvoiceRow shopId={shopId} invoice={item} onSettled={refresh} />
			)}
			contentContainerStyle={styles.list}
			refreshControl={
				<RefreshControl refreshing={billing.isRefetching} onRefresh={refresh} />
			}
		/>
	);
}

export default function BillingScreen() {
	const { t } = useTranslation();
	return (
		<BillingShell title={t("billing.title")}>
			{({ shopId }) => <BillingContent shopId={shopId} />}
		</BillingShell>
	);
}

const styles = StyleSheet.create({
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	list: { padding: 16, paddingBottom: 32 },
	header: { gap: 12, marginBottom: 12 },
	link: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
	separator: { height: 10 },
	empty: {
		textAlign: "center",
		padding: 24,
		borderWidth: 1,
		borderStyle: "dashed",
		borderRadius: 16,
	},
});
