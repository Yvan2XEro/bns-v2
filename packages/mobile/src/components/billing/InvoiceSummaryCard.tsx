import { StyleSheet, Text, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { INVOICE_LINE_KIND_KEYS } from "@/src/lib/billing";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import type { CommissionInvoiceView } from "@/src/types/order";
import { billingStyles as s } from "./billingStyles";
import { useLocaleKey } from "./useLocaleKey";

/** The amounts and lines exactly as the billing view states them. */
export function InvoiceSummaryCard({
	invoice,
}: {
	invoice: CommissionInvoiceView;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useLocaleKey();

	const row = (label: string, amount: number, strong = false) => (
		<View style={styles.row}>
			<Text
				style={[
					strong ? s.cardTitle : s.body,
					{ color: strong ? c.text : c.body },
				]}
			>
				{label}
			</Text>
			<Text style={[strong ? s.cardTitle : s.body, { color: c.text }]}>
				{formatXaf(amount, locale)}
			</Text>
		</View>
	);

	return (
		<View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
			{row(t("billing.commissionTotal"), invoice.commissionTotal)}
			{row(t("billing.vat"), invoice.vatAmount)}
			<View style={[styles.rule, { backgroundColor: c.border }]} />
			{row(t("billing.totalDue"), invoice.totalDue, true)}
			{invoice.lines.length > 0 ? (
				<>
					<Text style={[s.cardTitle, { color: c.text, marginTop: 10 }]}>
						{t("billing.linesTitle")}
					</Text>
					{invoice.lines.map((line, index) => (
						<View key={`${line.orderNumber}-${index}`} style={styles.row}>
							<View style={{ flex: 1 }}>
								<Text style={[s.body, { color: c.body }]}>
									{t("billing.lineOrder", { number: line.orderNumber })}
								</Text>
								<Text style={[s.meta, { color: c.muted }]}>
									{t(INVOICE_LINE_KIND_KEYS[line.kind])}
								</Text>
							</View>
							<Text style={[s.body, { color: c.text }]}>
								{formatXaf(line.amount, locale)}
							</Text>
						</View>
					))}
				</>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 12,
		paddingVertical: 2,
	},
	rule: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
});
