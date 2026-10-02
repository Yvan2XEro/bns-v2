import { Text } from "react-native";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate } from "@/src/lib/orderMoney";
import { withdrawalWindow } from "@/src/lib/purchaseActions";
import type { OrderView } from "@/src/types/order";
import { useShopTheme } from "../shop/theme";
import { purchaseText } from "./ui";

/** The return window in words, counted down from `deadlines.withdrawalUntil`. */
export function WithdrawalWindowNote({
	order,
	now,
}: {
	order: Pick<OrderView, "deadlines" | "returnCaseNumber">;
	now: Date;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const state = withdrawalWindow(order, now);

	if (state.kind === "none") return null;
	if (state.kind === "caseOpen") {
		return (
			<Text style={[purchaseText.body, { color: c.primary }]}>
				{t("purchases.withdrawalCaseOpen", { number: state.caseNumber })}
			</Text>
		);
	}
	if (state.kind === "closed") {
		return (
			<Text style={[purchaseText.muted, { color: c.muted }]}>
				{t("purchases.returnWindowClosed")}
			</Text>
		);
	}
	return (
		<>
			<Text style={[purchaseText.strong, { color: c.text }]}>
				{t("purchases.withdrawalCountdown", {
					days: state.days,
					hours: state.hours,
				})}
			</Text>
			<Text style={[purchaseText.muted, { color: c.muted }]}>
				{t("purchases.returnWindow", {
					date: formatOrderDate(state.until, lang),
				})}
			</Text>
		</>
	);
}
