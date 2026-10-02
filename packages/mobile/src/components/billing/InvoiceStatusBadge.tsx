import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { INVOICE_STATUS_KEYS, type InvoiceStatus } from "@/src/lib/billing";
import { useTranslation } from "@/src/lib/i18n";

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const tone: Record<InvoiceStatus, { bg: string; fg: string }> = {
		issued: { bg: c.primarySoft, fg: c.primary },
		paid: { bg: c.successSoft, fg: c.successText },
		overdue: { bg: c.dangerSoft, fg: c.dangerText },
		waived: { bg: c.neutralSoft, fg: c.neutralText },
		void: { bg: c.neutralSoft, fg: c.neutralText },
	};
	return (
		<View style={[styles.badge, { backgroundColor: tone[status].bg }]}>
			<Text style={[styles.text, { color: tone[status].fg }]}>
				{t(INVOICE_STATUS_KEYS[status])}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	badge: {
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 3,
		alignSelf: "flex-start",
	},
	text: { fontSize: 12, fontFamily: Fonts.bodySemibold },
});
