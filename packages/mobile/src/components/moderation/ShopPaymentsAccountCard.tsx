import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import {
	CONNECTED_ACCOUNT_STATUSES,
	NAME_MATCH_RESULTS,
	PAYOUT_METHODS,
} from "@/src/lib/paymentStatus";
import type {
	ShopPaymentsPendingAccount,
	ShopPaymentsSheet,
} from "@/src/types/api";
import type { ModerationPalette, Translate } from "./theme";

interface ShopPaymentsAccountCardProps {
	connectedAccount: ShopPaymentsSheet["connectedAccount"];
	payoutAccount: ShopPaymentsSheet["payoutAccount"];
	pendingAccounts: ShopPaymentsPendingAccount[];
	actionable: boolean;
	decisionPending: boolean;
	onApprove: (accountId: string) => void;
	onReject: (accountId: string) => void;
	c: ModerationPalette;
	t: Translate;
}

/** The connected account, the active payout account, and any pending one
 * awaiting the name-match review. */
export function ShopPaymentsAccountCard({
	connectedAccount,
	payoutAccount,
	pendingAccounts,
	actionable,
	decisionPending,
	onApprove,
	onReject,
	c,
	t,
}: ShopPaymentsAccountCardProps) {
	return (
		<View style={{ gap: 10 }}>
			<Text style={[styles.sectionLabel, { color: c.muted }]}>
				{t("moderation.paymentsAccountLabel")}
			</Text>
			<Text style={[styles.body, { color: c.text }]}>
				{connectedAccount
					? `${t(CONNECTED_ACCOUNT_STATUSES[connectedAccount.status])} · ${
							connectedAccount.lastSyncedAt
								? formatDate(connectedAccount.lastSyncedAt)
								: "—"
						}`
					: t("moderation.paymentsAccountNone")}
			</Text>

			<Text style={[styles.sectionLabel, { color: c.muted, marginTop: 6 }]}>
				{t("moderation.paymentsPayoutAccountLabel")}
			</Text>
			<Text style={[styles.body, { color: c.text }]}>
				{payoutAccount
					? `${t(PAYOUT_METHODS[payoutAccount.method])} · ${payoutAccount.accountNumberMasked}`
					: t("moderation.paymentsPayoutAccountNone")}
			</Text>

			<Text style={[styles.sectionLabel, { color: c.muted, marginTop: 6 }]}>
				{t("moderation.paymentsPendingAccountsTitle")}
			</Text>
			{pendingAccounts.length === 0 ? (
				<Text style={[styles.meta, { color: c.muted }]}>
					{t("moderation.paymentsPendingAccountsEmpty")}
				</Text>
			) : (
				pendingAccounts.map((account) => (
					<PendingAccountRow
						key={account.id}
						account={account}
						actionable={actionable}
						pending={decisionPending}
						onApprove={() => onApprove(account.id)}
						onReject={() => onReject(account.id)}
						c={c}
						t={t}
					/>
				))
			)}
		</View>
	);
}

function PendingAccountRow({
	account,
	actionable,
	pending,
	onApprove,
	onReject,
	c,
	t,
}: {
	account: ShopPaymentsPendingAccount;
	actionable: boolean;
	pending: boolean;
	onApprove: () => void;
	onReject: () => void;
	c: ModerationPalette;
	t: Translate;
}) {
	return (
		<View style={[styles.row, { borderColor: c.border }]}>
			<View style={{ flex: 1, gap: 2 }}>
				<Text style={[styles.body, { color: c.text }]}>
					{t(PAYOUT_METHODS[account.method])} · {account.accountNumberMasked}
				</Text>
				{account.nameMatch ? (
					<Text style={[styles.meta, { color: c.muted }]}>
						{t(NAME_MATCH_RESULTS[account.nameMatch.result])}
					</Text>
				) : null}
			</View>
			{actionable ? (
				<View style={{ flexDirection: "row", gap: 8 }}>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t("moderation.paymentsApprove")}
						onPress={onApprove}
						disabled={pending}
						style={[styles.smallBtn, { backgroundColor: c.success }]}
					>
						{pending ? (
							<ActivityIndicator color="#fff" size="small" />
						) : (
							<Text style={styles.smallBtnText}>
								{t("moderation.paymentsApprove")}
							</Text>
						)}
					</Pressable>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t("moderation.paymentsReject")}
						onPress={onReject}
						disabled={pending}
						style={[styles.smallBtn, { backgroundColor: c.danger }]}
					>
						<Text style={styles.smallBtnText}>
							{t("moderation.paymentsReject")}
						</Text>
					</Pressable>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	sectionLabel: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	body: { fontSize: 14, fontFamily: Fonts.body },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		padding: 10,
	},
	smallBtn: {
		minHeight: 36,
		borderRadius: 10,
		paddingHorizontal: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	smallBtnText: { fontSize: 12, fontFamily: Fonts.bodySemibold, color: "#fff" },
});
