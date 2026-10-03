import { StyleSheet, Text, View } from "react-native";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate } from "@/src/lib/orderMoney";
import {
	HOLD_CATEGORY_DESCRIPTIONS,
	HOLD_CATEGORY_LABELS,
} from "@/src/lib/paymentStatus";
import type { PaymentHoldView } from "@/src/types/order";

/**
 * Renders `holds[]` on the seller's own screens — category only, no amount
 * and no order id (the API's deliberate omission; see `holdsView` on the
 * API side). Shared by the hub and the setup screen, which carry the exact
 * same shape.
 */
export function HoldsList({ holds }: { holds: PaymentHoldView[] }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useLocaleKey();

	if (holds.length === 0) {
		return (
			<Text style={[s.meta, { color: c.muted }]}>
				{t("payments.seller_noHolds")}
			</Text>
		);
	}

	return (
		<View style={styles.list}>
			{holds.map((hold, index) => (
				<View
					key={`${hold.scope}-${hold.reasonCategory}-${index}`}
					style={[
						styles.row,
						{ backgroundColor: c.warningSoft, borderColor: c.border },
					]}
				>
					<Text style={[s.cardTitle, { color: c.warningText, fontSize: 13 }]}>
						{t(HOLD_CATEGORY_LABELS[hold.reasonCategory])}
					</Text>
					<Text style={[s.meta, { color: c.body }]}>
						{hold.scope === "shop"
							? t("payments.hold_onShop")
							: t("payments.seller_holdOnOrder")}
					</Text>
					<Text style={[s.meta, { color: c.muted }]}>
						{t(HOLD_CATEGORY_DESCRIPTIONS[hold.reasonCategory])}
					</Text>
					<Text style={[s.meta, { color: c.muted }]}>
						{hold.until
							? t("payments.hold_until", {
									date: formatOrderDate(hold.until, locale),
								})
							: t("payments.hold_untilReleased")}
					</Text>
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	list: { gap: 8 },
	row: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 4 },
});
