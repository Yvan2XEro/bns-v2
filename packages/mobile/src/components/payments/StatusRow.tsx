import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import {
	CONNECTED_ACCOUNT_STATUSES,
	PAYOUT_ACCOUNT_STATUSES,
	PAYOUT_METHODS,
} from "@/src/lib/paymentStatus";
import type { PaymentSetupView } from "@/src/types/order";

/**
 * A three-line glance at the account, the payout account and any hold,
 * linking to the setup screen for the detail. `setup` is `undefined` while
 * it is still loading — the row stays silent rather than guessing.
 */
export function StatusRow({
	setup,
	holdsCount,
}: {
	setup: PaymentSetupView | undefined;
	holdsCount: number;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();

	const accountValue = setup?.connectedAccount
		? t(CONNECTED_ACCOUNT_STATUSES[setup.connectedAccount.status])
		: t("payments.accountStatus_created");

	const payoutAccountValue = setup?.payoutAccount
		? `${t(PAYOUT_METHODS[setup.payoutAccount.method])} · ${setup.payoutAccount.accountNumberMasked}`
		: setup?.pendingAccount
			? t(PAYOUT_ACCOUNT_STATUSES.pending_review)
			: t("payments.seller_payoutAccountNotSet");

	const holdsValue =
		holdsCount > 0
			? t("payments.seller_actionRequired")
			: t("payments.seller_noHolds");

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={t("payments.setup_title")}
			onPress={() => router.push("/seller/payments/setup")}
			style={[
				s.card,
				styles.row,
				{ backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<View style={styles.lines}>
				<StatusLine
					label={t("payments.seller_statusAccount")}
					value={accountValue}
					c={c}
				/>
				<StatusLine
					label={t("payments.seller_statusPayoutAccount")}
					value={payoutAccountValue}
					c={c}
				/>
				<StatusLine
					label={t("payments.seller_statusHolds")}
					value={holdsValue}
					tone={holdsCount > 0 ? "warn" : "ok"}
					c={c}
				/>
			</View>
			<Ionicons name="chevron-forward" size={18} color={c.muted} />
		</Pressable>
	);
}

function StatusLine({
	label,
	value,
	tone = "ok",
	c,
}: {
	label: string;
	value: string;
	tone?: "ok" | "warn";
	c: ReturnType<typeof useShopTheme>;
}) {
	return (
		<View style={styles.line}>
			<Text style={[s.meta, { color: c.muted }]}>{label}</Text>
			<Text
				style={[
					s.meta,
					{
						color: tone === "warn" ? c.warningText : c.text,
						fontWeight: "600",
					},
				]}
			>
				{value}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: "row", alignItems: "center", gap: 10 },
	lines: { flex: 1, gap: 6 },
	line: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
});
