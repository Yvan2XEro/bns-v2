import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView } from "react-native";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import {
	type DecisionChoice,
	type DecisionDuration,
	DecisionSheet,
} from "@/src/components/moderation/DecisionSheet";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import { ShopActionBar } from "@/src/components/moderation/ShopActionBar";
import { ShopHistoryList } from "@/src/components/moderation/ShopHistoryList";
import { ShopIdentityCard } from "@/src/components/moderation/ShopIdentityCard";
import { ShopPaymentsAccountCard } from "@/src/components/moderation/ShopPaymentsAccountCard";
import { ShopPaymentsHoldsCard } from "@/src/components/moderation/ShopPaymentsHoldsCard";
import { ShopPaymentsStatsCard } from "@/src/components/moderation/ShopPaymentsStatsCard";
import { ShopSuspensionCard } from "@/src/components/moderation/ShopSuspensionCard";
import { ShopTeamCard } from "@/src/components/moderation/ShopTeamCard";
import { useModerationTheme } from "@/src/components/moderation/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	useApprovePayoutAccount,
	useHoldShopPayouts,
	useModerationShop,
	useRejectPayoutAccount,
	useReleasePayoutHold,
	useSuspendShop,
	useUnsuspendShop,
} from "@/src/hooks/useModeration";
import { useResponsive } from "@/src/hooks/useResponsive";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";
import {
	availableDurations,
	canActOn,
	SUSPENSION_REASONS,
} from "@/src/lib/moderation";
import {
	MANUAL_HOLD_REASONS,
	MODERATION_HOLD_REASON_LABELS,
} from "@/src/lib/moderationPayments";
import type { PayoutHoldReason } from "@/src/lib/paymentStatus";
import type { SuspensionReason } from "@/src/types/api";

/** Which payments sheet is open, if any — exclusive, so one `useState`
 * carries it rather than a boolean per action. */
type PaymentsSheetState =
	| { kind: "hold" }
	| { kind: "release"; holdId: string }
	| { kind: "approve"; accountId: string }
	| { kind: "reject"; accountId: string }
	| null;

interface PaymentsSheetConfig {
	title: string;
	choices?: DecisionChoice[];
	choicesLabel?: string;
	durations?: DecisionDuration[];
	durationsLabel?: string;
	confirmLabel: string;
	pending: boolean;
	destructive: boolean;
}

export default function ModerateShopScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const c = useModerationTheme();
	const { t } = useTranslation();
	const { user: me } = useAuth();
	const { centeredContent } = useResponsive();
	const locale = useLocaleKey();
	const { showError, showSuccess, showConfirm } = useAlert();
	const [suspending, setSuspending] = useState(false);
	const [paymentsSheet, setPaymentsSheet] = useState<PaymentsSheetState>(null);

	const { data, isLoading } = useModerationShop(id);
	const { mutate: suspend, isPending: suspendPending } = useSuspendShop();
	const { mutate: unsuspend, isPending: liftPending } = useUnsuspendShop();
	const { mutate: holdPayouts, isPending: holdPending } = useHoldShopPayouts();
	const { mutate: releaseHold, isPending: releasePending } =
		useReleasePayoutHold();
	const { mutate: approveAccount, isPending: approvePending } =
		useApprovePayoutAccount();
	const { mutate: rejectAccount, isPending: rejectPending } =
		useRejectPayoutAccount();
	const decisionPending = approvePending || rejectPending;

	const shop = data?.shop;
	const owner = data?.owner;
	const suspension = data?.suspension;
	// The rank compared is the owner's, as on the API side: a moderator cannot
	// act on a shop owned by another moderator or admin.
	const actionable = canActOn(me, owner);

	const durations = availableDurations(me).map((value) => ({
		value,
		label:
			value === null
				? t("moderation.durationIndefinite")
				: t("moderation.durationDays", { count: value }),
	}));
	const reasons = SUSPENSION_REASONS.map((value) => ({
		value,
		label: t(`report.${value}`),
	}));

	const onSuspend = ({
		choice,
		durationDays,
		text,
	}: {
		choice: string | null;
		durationDays: number | null;
		text: string;
	}) => {
		if (!choice) return;
		suspend(
			{
				shopId: String(id),
				reason: choice as SuspensionReason,
				durationDays,
				note: text || undefined,
			},
			{
				onSuccess: (result) => {
					setSuspending(false);
					showSuccess(
						t("moderation.shopSuspendedTitle"),
						t("moderation.shopSuspendedMessage", {
							count: result.unpublishedListingIds.length,
						}),
					);
				},
				onError: (error) =>
					showError(
						t("moderation.actionFailed"),
						resolveErrorMessage(error, t),
					),
			},
		);
	};

	const onLift = () =>
		showConfirm(
			t("moderation.shopLiftTitle"),
			t("moderation.shopLiftMessage"),
			() =>
				unsuspend(
					{ shopId: String(id) },
					{
						onSuccess: (result) =>
							showSuccess(
								t("moderation.liftedTitle"),
								t("moderation.liftedMessage", {
									count: result.restoredListingIds.length,
								}),
							),
						onError: (error) =>
							showError(
								t("moderation.actionFailed"),
								resolveErrorMessage(error, t),
							),
					},
				),
		);

	const holdReasons = MANUAL_HOLD_REASONS.map((value) => ({
		value,
		label: t(MODERATION_HOLD_REASON_LABELS[value]),
	}));
	// Reuses the suspend sheet's own duration vocabulary: a fixed hold and an
	// indefinite one read the same whether it is an account or a payout.
	const holdDurations: Array<{ value: number | null; label: string }> = [
		7, 14, 30,
	].map((value) => ({
		value,
		label: t("moderation.durationDays", { count: value }),
	}));
	holdDurations.push({
		value: null,
		label: t("moderation.durationIndefinite"),
	});

	const onPaymentsSheetConfirm = ({
		choice,
		durationDays,
		text,
	}: {
		choice: string | null;
		durationDays: number | null;
		text: string;
	}) => {
		if (!paymentsSheet) return;
		const note = text || undefined;
		if (paymentsSheet.kind === "hold" && choice) {
			holdPayouts(
				{
					shopId: String(id),
					reason: choice as PayoutHoldReason,
					untilDays: durationDays,
					note,
				},
				{
					onSuccess: () => {
						setPaymentsSheet(null);
						showSuccess(t("moderation.paymentsHoldPlaced"), "");
					},
					onError: (error) =>
						showError(
							t("moderation.actionFailed"),
							resolveErrorMessage(error, t),
						),
				},
			);
		} else if (paymentsSheet.kind === "release") {
			releaseHold(
				{ shopId: String(id), holdId: paymentsSheet.holdId, note },
				{
					onSuccess: () => {
						setPaymentsSheet(null);
						showSuccess(t("moderation.paymentsHoldReleased"), "");
					},
					onError: (error) =>
						showError(
							t("moderation.actionFailed"),
							resolveErrorMessage(error, t),
						),
				},
			);
		} else if (paymentsSheet.kind === "approve") {
			approveAccount(
				{ shopId: String(id), accountId: paymentsSheet.accountId, note },
				{
					onSuccess: () => {
						setPaymentsSheet(null);
						showSuccess(t("moderation.paymentsAccountApproved"), "");
					},
					onError: (error) =>
						showError(
							t("moderation.actionFailed"),
							resolveErrorMessage(error, t),
						),
				},
			);
		} else if (paymentsSheet.kind === "reject") {
			rejectAccount(
				{ shopId: String(id), accountId: paymentsSheet.accountId, note },
				{
					onSuccess: () => {
						setPaymentsSheet(null);
						showSuccess(t("moderation.paymentsAccountRejected"), "");
					},
					onError: (error) =>
						showError(
							t("moderation.actionFailed"),
							resolveErrorMessage(error, t),
						),
				},
			);
		}
	};

	const paymentsSheetConfig: PaymentsSheetConfig | null = (() => {
		if (!paymentsSheet) return null;
		if (paymentsSheet.kind === "hold") {
			return {
				title: t("moderation.paymentsPlaceHoldSheetTitle"),
				choices: holdReasons,
				choicesLabel: t("moderation.paymentsReasonLabel"),
				durations: holdDurations,
				durationsLabel: t("moderation.suspendDurationLabel"),
				confirmLabel: t("moderation.paymentsPlaceHold"),
				pending: holdPending,
				destructive: true,
			};
		}
		if (paymentsSheet.kind === "release") {
			return {
				title: t("moderation.paymentsReleaseSheetTitle"),
				confirmLabel: t("moderation.paymentsReleaseHold"),
				pending: releasePending,
				destructive: false,
			};
		}
		if (paymentsSheet.kind === "approve") {
			return {
				title: t("moderation.paymentsApproveSheetTitle"),
				confirmLabel: t("moderation.paymentsApprove"),
				pending: approvePending,
				destructive: false,
			};
		}
		return {
			title: t("moderation.paymentsRejectSheetTitle"),
			confirmLabel: t("moderation.paymentsReject"),
			pending: rejectPending,
			destructive: true,
		};
	})();

	return (
		<ModerationScreen title={t("moderation.shopTitle")} subtitle={shop?.name}>
			{isLoading || !data || !shop || !owner || !suspension ? (
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			) : (
				<>
					<ScrollView
						contentContainerStyle={[
							{ padding: 16, gap: 14, paddingBottom: 24 },
							centeredContent,
						]}
					>
						<ShopIdentityCard
							shop={shop}
							owner={owner}
							counts={data.counts}
							c={c}
							t={t}
						/>
						<ShopSuspensionCard suspension={suspension} c={c} t={t} />
						<ShopTeamCard
							team={data.team}
							activity={data.activity}
							c={c}
							t={t}
						/>
						<ShopHistoryList
							reports={data.reports}
							history={data.history}
							c={c}
							t={t}
						/>
						<ShopPaymentsAccountCard
							connectedAccount={data.payments.connectedAccount}
							payoutAccount={data.payments.payoutAccount}
							pendingAccounts={data.payments.pendingAccounts}
							actionable={actionable}
							decisionPending={decisionPending}
							onApprove={(accountId) =>
								setPaymentsSheet({ kind: "approve", accountId })
							}
							onReject={(accountId) =>
								setPaymentsSheet({ kind: "reject", accountId })
							}
							c={c}
							t={t}
						/>
						<ShopPaymentsHoldsCard
							holds={data.payments.holds}
							actionable={actionable}
							releasePending={releasePending}
							onPlaceHold={() => setPaymentsSheet({ kind: "hold" })}
							onReleaseHold={(holdId) =>
								setPaymentsSheet({ kind: "release", holdId })
							}
							c={c}
							t={t}
						/>
						<ShopPaymentsStatsCard
							lastPayouts={data.payments.lastPayouts}
							openExposure={data.payments.openExposure}
							refundRate={data.payments.refundRate}
							locale={locale}
							c={c}
							t={t}
						/>
					</ScrollView>

					<ShopActionBar
						actionable={actionable}
						status={shop.status}
						suspendPending={suspendPending}
						liftPending={liftPending}
						onSuspend={() => setSuspending(true)}
						onLift={onLift}
						c={c}
						t={t}
					/>

					<DecisionSheet
						visible={suspending}
						title={t("moderation.shopSuspendSheetTitle")}
						subtitle={t("moderation.shopSuspendSheetSubtitle")}
						choices={reasons}
						choicesLabel={t("moderation.suspendReasonLabel")}
						durations={durations}
						durationsLabel={t("moderation.suspendDurationLabel")}
						textLabel={t("moderation.internalNoteLabel")}
						textPlaceholder={t("moderation.internalNotePlaceholder")}
						confirmLabel={t("moderation.shopConfirmSuspend")}
						destructive
						pending={suspendPending}
						onConfirm={onSuspend}
						onClose={() => setSuspending(false)}
					/>

					{paymentsSheetConfig ? (
						<DecisionSheet
							visible={Boolean(paymentsSheet)}
							title={paymentsSheetConfig.title}
							choices={paymentsSheetConfig.choices}
							choicesLabel={paymentsSheetConfig.choicesLabel}
							durations={paymentsSheetConfig.durations}
							durationsLabel={paymentsSheetConfig.durationsLabel}
							textLabel={t("moderation.internalNoteLabel")}
							textPlaceholder={t("moderation.internalNotePlaceholder")}
							confirmLabel={paymentsSheetConfig.confirmLabel}
							destructive={paymentsSheetConfig.destructive}
							pending={paymentsSheetConfig.pending}
							onConfirm={onPaymentsSheetConfirm}
							onClose={() => setPaymentsSheet(null)}
						/>
					) : null}
				</>
			)}
		</ModerationScreen>
	);
}
