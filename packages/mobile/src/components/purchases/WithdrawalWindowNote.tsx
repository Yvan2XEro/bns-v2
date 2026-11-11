import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate } from "@/src/lib/orderMoney";
import { withdrawalWindow } from "@/src/lib/purchaseActions";
import type { OrderView } from "@/src/types/order";
import { inkOf } from "../checkout/fill";
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
			<Note icon="return-down-back-outline" color={inkOf(c)}>
				<Text style={[purchaseText.strong, { color: c.text }]}>
					{t("purchases.withdrawalCaseOpen", { number: state.caseNumber })}
				</Text>
			</Note>
		);
	}
	if (state.kind === "closed") {
		return (
			<Note icon="calendar-outline" color={c.muted}>
				<Text style={[purchaseText.muted, { color: c.muted }]}>
					{t("purchases.returnWindowClosed")}
				</Text>
			</Note>
		);
	}
	return (
		<Note icon="calendar-outline" color={inkOf(c)}>
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
		</Note>
	);
}

function Note({
	icon,
	color,
	children,
}: {
	icon: ComponentProps<typeof Ionicons>["name"];
	color: string;
	children: ReactNode;
}) {
	const c = useShopTheme();
	return (
		<View
			style={[styles.note, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Ionicons name={icon} size={20} color={color} style={styles.icon} />
			<View style={styles.text}>{children}</View>
		</View>
	);
}

const styles = StyleSheet.create({
	note: {
		flexDirection: "row",
		gap: 12,
		padding: 14,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	icon: { marginTop: 1 },
	text: { flex: 1, gap: 2 },
});
