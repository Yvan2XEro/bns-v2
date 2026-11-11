import { StyleSheet, Text, View } from "react-native";
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
import { DecisionButton, ModerationCard, SectionTitle } from "./ModerationKit";
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
		<>
			<ModerationCard>
				<Block
					label={t("moderation.paymentsAccountLabel")}
					value={
						connectedAccount
							? `${t(CONNECTED_ACCOUNT_STATUSES[connectedAccount.status])} · ${
									connectedAccount.lastSyncedAt
										? formatDate(connectedAccount.lastSyncedAt)
										: "—"
								}`
							: t("moderation.paymentsAccountNone")
					}
					c={c}
				/>
				<View style={[styles.rule, { backgroundColor: c.border }]} />
				<Block
					label={t("moderation.paymentsPayoutAccountLabel")}
					value={
						payoutAccount
							? `${t(PAYOUT_METHODS[payoutAccount.method])} · ${payoutAccount.accountNumberMasked}`
							: t("moderation.paymentsPayoutAccountNone")
					}
					c={c}
				/>
			</ModerationCard>

			<View style={styles.section}>
				<SectionTitle>
					{t("moderation.paymentsPendingAccountsTitle")}
				</SectionTitle>
				{pendingAccounts.length === 0 ? (
					<Text style={[styles.empty, { color: c.muted }]}>
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
		</>
	);
}

function Block({
	label,
	value,
	c,
}: {
	label: string;
	value: string;
	c: ModerationPalette;
}) {
	return (
		<View style={styles.block}>
			<Text
				accessibilityRole="header"
				style={[styles.blockLabel, { color: c.text }]}
			>
				{label}
			</Text>
			<Text style={[styles.body, { color: c.text }]}>{value}</Text>
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
		<ModerationCard>
			<View style={styles.block}>
				<Text style={[styles.accountLine, { color: c.text }]}>
					{t(PAYOUT_METHODS[account.method])} · {account.accountNumberMasked}
				</Text>
				{account.nameMatch ? (
					<Text style={[styles.meta, { color: c.muted }]}>
						{t(NAME_MATCH_RESULTS[account.nameMatch.result])}
					</Text>
				) : null}
			</View>
			{actionable ? (
				// Both open the confirmation sheet; reject sits left, as everywhere.
				<View style={styles.actions}>
					<DecisionButton
						variant="dangerOutline"
						label={t("moderation.paymentsReject")}
						onPress={onReject}
						disabled={pending}
					/>
					<DecisionButton
						variant="approve"
						icon="checkmark"
						label={t("moderation.paymentsApprove")}
						onPress={onApprove}
						disabled={pending}
					/>
				</View>
			) : null}
		</ModerationCard>
	);
}

const styles = StyleSheet.create({
	section: { gap: 8 },
	block: { gap: 3 },
	blockLabel: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.displayBold },
	rule: { height: StyleSheet.hairlineWidth },
	body: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	accountLine: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	empty: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	actions: { flexDirection: "row", gap: 10 },
});
