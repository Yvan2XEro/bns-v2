import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { INVOICE_LINE_KIND_KEYS } from "@/src/lib/billing";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { CommissionInvoiceView } from "@/src/types/order";
import { billingStyles as s } from "./billingStyles";
import { useLocaleKey } from "./useLocaleKey";

/**
 * The amounts and lines exactly as the billing view states them. Amounts are
 * set in Poppins with tabular figures so a column of them lines up; the total
 * due stays plain ink, not a yellow tag, because it is money the shop owes.
 */
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
					styles.label,
					{ color: strong ? c.text : c.body },
				]}
			>
				{label}
			</Text>
			<Text
				style={[strong ? styles.totalAmount : styles.amount, { color: c.text }]}
			>
				{formatPrice(amount, locale)}
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
					<Text
						accessibilityRole="header"
						style={[s.cardTitle, styles.linesTitle, { color: c.text }]}
					>
						{t("billing.linesTitle")}
					</Text>
					{invoice.lines.map((line, index) => (
						<View
							key={`${line.orderNumber}-${index}`}
							style={[
								styles.row,
								styles.lineRow,
								index > 0 && {
									borderTopWidth: StyleSheet.hairlineWidth,
									borderTopColor: c.border,
								},
							]}
						>
							<View style={styles.label}>
								<Text style={[s.body, { color: c.body }]}>
									{t("billing.lineOrder", { number: line.orderNumber })}
								</Text>
								<Text style={[s.meta, { color: c.muted }]}>
									{t(INVOICE_LINE_KIND_KEYS[line.kind])}
								</Text>
							</View>
							<Text style={[styles.amount, { color: c.text }]}>
								{formatPrice(line.amount, locale)}
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
	lineRow: { paddingVertical: 8 },
	label: { flex: 1 },
	linesTitle: { marginTop: 14, marginBottom: 2 },
	amount: {
		fontSize: 15,
		lineHeight: 20,
		fontFamily: Fonts.displaySemibold,
		fontVariant: ["tabular-nums"],
	},
	totalAmount: {
		fontSize: 20,
		lineHeight: 28,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.3,
		fontVariant: ["tabular-nums"],
	},
	rule: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
});
