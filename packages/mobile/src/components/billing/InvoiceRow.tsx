import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { isPayable } from "@/src/lib/billing";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate, formatXaf } from "@/src/lib/orderMoney";
import type { CommissionInvoiceView } from "@/src/types/order";
import { billingStyles as s } from "./billingStyles";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { PayInvoiceButton } from "./PayInvoiceButton";
import { useLocaleKey } from "./useLocaleKey";

export function InvoiceRow({
	shopId,
	invoice,
	onSettled,
}: {
	shopId: string;
	invoice: CommissionInvoiceView;
	onSettled: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useLocaleKey();
	const number = t("billing.invoiceNumber", { number: invoice.invoiceNumber });

	return (
		<View
			style={[
				s.card,
				styles.row,
				{ backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`${t("billing.viewInvoice")} — ${number}`}
				onPress={() => router.push(`/seller/billing/${invoice.id}`)}
				style={styles.main}
			>
				<View style={styles.head}>
					<Text style={[s.cardTitle, { color: c.primary }]}>{number}</Text>
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
				<Text style={[s.meta, { color: c.body }]}>
					{invoice.paidAt
						? t("billing.paidAt", {
								date: formatOrderDate(invoice.paidAt, locale),
							})
						: t("billing.dueAt", {
								date: formatOrderDate(invoice.dueAt, locale),
							})}
				</Text>
				<Text style={[s.cardTitle, { color: c.text }]}>
					{formatXaf(invoice.totalDue, locale)}
				</Text>
			</Pressable>
			{isPayable(invoice.status) ? (
				<PayInvoiceButton
					shopId={shopId}
					invoiceId={invoice.id}
					onSettled={onSettled}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	row: { gap: 10 },
	main: { gap: 4, minHeight: 44 },
	head: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
	},
});
