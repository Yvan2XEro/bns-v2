import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { BillingShell } from "@/src/components/billing/BillingShell";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { InvoiceStatusBadge } from "@/src/components/billing/InvoiceStatusBadge";
import { InvoiceSummaryCard } from "@/src/components/billing/InvoiceSummaryCard";
import { PayInvoiceButton } from "@/src/components/billing/PayInvoiceButton";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import { EmptyState } from "@/src/components/EmptyState";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useBilling, useInvoiceDocument } from "@/src/hooks/useBilling";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { findInvoice, isPayable } from "@/src/lib/billing";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate } from "@/src/lib/orderMoney";
import { shareHtmlDocument } from "@/src/lib/shareHtmlDocument";

function InvoiceContent({
	shopId,
	invoiceId,
}: {
	shopId: string;
	invoiceId: string | undefined;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useLocaleKey();
	const { showError } = useAlert();
	const billing = useBilling(shopId);
	// Fetched on tap only: the markup sits behind the caller's token.
	const document = useInvoiceDocument(invoiceId, locale, false);
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

	const invoice = findInvoice(billing.data, invoiceId);
	if (!invoice) {
		return (
			<EmptyState
				illustration="notFound"
				title={t("billing.invoiceNotFound")}
			/>
		);
	}
	const number = t("billing.invoiceNumber", { number: invoice.invoiceNumber });

	const openDocument = async () => {
		const result = await document.refetch();
		if (result.data === undefined) {
			showError(
				t("billing.documentFailed"),
				resolveErrorMessage(result.error, t),
			);
			return;
		}
		try {
			await shareHtmlDocument(result.data, invoice.invoiceNumber, number);
		} catch (error) {
			showError(t("billing.documentFailed"), resolveErrorMessage(error, t));
		}
	};

	return (
		<ScrollView
			contentContainerStyle={styles.content}
			refreshControl={
				<RefreshControl refreshing={billing.isRefetching} onRefresh={refresh} />
			}
		>
			<View
				style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<View style={styles.head}>
					<Text style={[s.cardTitle, { color: c.text, fontSize: 18 }]}>
						{number}
					</Text>
					<InvoiceStatusBadge status={invoice.status} />
				</View>
				<Text style={[s.meta, { color: c.muted }]}>
					{t("billing.periodRange", {
						start: formatOrderDate(invoice.periodStart, locale),
						end: formatOrderDate(invoice.periodEnd, locale),
					})}
					{" · "}
					{t("billing.ordersCount", { count: invoice.ordersCount })}
				</Text>
				<Text style={[s.body, { color: c.body }]}>
					{invoice.paidAt
						? t("billing.paidAt", {
								date: formatOrderDate(invoice.paidAt, locale),
							})
						: t("billing.dueAt", {
								date: formatOrderDate(invoice.dueAt, locale),
							})}
				</Text>
				{isPayable(invoice.status) ? (
					<>
						<PayInvoiceButton
							shopId={shopId}
							invoiceId={invoice.id}
							onSettled={refresh}
						/>
						<Text style={[s.meta, { color: c.muted }]}>
							{t("billing.payHint")}
						</Text>
					</>
				) : null}
			</View>

			<InvoiceSummaryCard invoice={invoice} />

			<View
				style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<Text style={[s.cardTitle, { color: c.text }]}>
					{t("billing.document")}
				</Text>
				<Text style={[s.meta, { color: c.muted }]}>
					{t("billing.documentHint")}
				</Text>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("billing.openDocument")}
					accessibilityState={{ busy: document.isFetching }}
					onPress={openDocument}
					disabled={document.isFetching}
					style={[s.button, { backgroundColor: c.primarySoft, marginTop: 6 }]}
				>
					{document.isFetching ? (
						<ActivityIndicator color={c.primary} />
					) : (
						<Ionicons
							name="document-text-outline"
							size={18}
							color={c.primary}
						/>
					)}
					<Text style={[s.buttonText, { color: c.primary }]}>
						{t("billing.openDocument")}
					</Text>
				</Pressable>
			</View>
		</ScrollView>
	);
}

export default function InvoiceScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const { t } = useTranslation();
	return (
		<BillingShell title={t("billing.title")}>
			{({ shopId }) => <InvoiceContent shopId={shopId} invoiceId={id} />}
		</BillingShell>
	);
}

const styles = StyleSheet.create({
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	content: { padding: 16, gap: 12, paddingBottom: 32 },
	head: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
	},
});
