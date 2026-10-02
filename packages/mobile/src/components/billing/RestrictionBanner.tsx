import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { restrictionClearKey } from "@/src/lib/billing";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate } from "@/src/lib/orderMoney";
import type { BillingView } from "@/src/types/order";
import { billingStyles as s } from "./billingStyles";
import { useLocaleKey } from "./useLocaleKey";

/** Says what is blocked, what is not, and what lifts it — the same words as web. */
export function RestrictionBanner({
	restricted,
}: {
	restricted: NonNullable<BillingView["restricted"]>;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useLocaleKey();

	return (
		<View
			accessibilityRole="alert"
			style={[
				s.card,
				{
					backgroundColor: c.dangerSoft,
					borderColor: c.danger,
					flexDirection: "row",
					gap: 10,
				},
			]}
		>
			<Ionicons name="shield-outline" size={20} color={c.danger} />
			<View style={{ flex: 1, gap: 6 }}>
				<Text style={[s.cardTitle, { color: c.dangerText }]}>
					{t("billing.restrictedTitle")}
				</Text>
				<Text style={[s.meta, { color: c.dangerText }]}>
					{t("billing.restrictedSince", {
						date: formatOrderDate(restricted.since, locale),
					})}
				</Text>
				<Text style={[s.body, { color: c.dangerText }]}>
					{t("billing.restrictedBlocked")}
				</Text>
				<Text style={[s.body, { color: c.body }]}>
					{t("billing.restrictedAllowed")}
				</Text>
				<Text style={[s.body, { color: c.dangerText, fontWeight: "600" }]}>
					{t(restrictionClearKey(restricted.reason))}
				</Text>
			</View>
		</View>
	);
}
