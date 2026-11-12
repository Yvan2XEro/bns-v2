import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import {
	type DecisionChoice,
	type DecisionDuration,
	DecisionSheet,
} from "@/src/components/moderation/DecisionSheet";
import {
	DetailSkeleton,
	LoadError,
} from "@/src/components/moderation/ModerationKit";
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
import { tonesOf } from "@/src/components/moderation/tones";
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

type Section = "overview" | "payments" | "history";
const SECTIONS: Section[] = ["overview", "payments", "history"];
const SECTION_LABEL: Record<Section, string> = {
	overview: "moderation.shopSectionOverview",
	payments: "moderation.shopSectionPayments",
	history: "moderation.shopSectionHistory",
};

interface PaymentsSheetConfig {
	title: string;
	subtitle?: string;
	choices?: DecisionChoice[];
	choicesLabel?: string;
	durations?: DecisionDuration[];
	durationsLabel?: string;
	confirmLabel: string;
	pending: boolean;
	destructive: boolean;
}

export default function ModerateShopScreen() {
	const { id, section: initialSection } = useLocalSearchParams<{
		id: string;
		section?: string;
	}>();
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t } = useTranslation();
	const { user: me } = useAuth();
	const { centeredContent } = useResponsive();
	const locale = useLocaleKey();
	const { showError, showSuccess, showConfirm } = useAlert();
	const [suspending, setSuspending] = useState(false);
	const [paymentsSheet, setPaymentsSheet] = useState<PaymentsSheetState>(null);
	// Failures show inside the open sheet: an alert cannot open over it.
	const [sheetError, setSheetError] = useState<string | null>(null);
	const failed = (error: unknown) =>
		setSheetError(resolveErrorMessage(error, t));
	const openPaymentsSheet = (next: PaymentsSheetState) => {
		setSheetError(null);
		setPaymentsSheet(next);
	};

	// Seven cards is a long scroll: the jump bar reaches the payments or the
	// history in one tap, and a link from a payments risk flag opens there.
	const scrollRef = useRef<ScrollView>(null);
	const offsets = useRef<Record<Section, number>>({
		overview: 0,
		payments: 0,
		history: 0,
	});
	const [section, setSection] = useState<Section>("overview");
	const jumped = useRef(false);
	const jumpTo = (next: Section, animated = true) => {
		setSection(next);
		scrollRef.current?.scrollTo({
			y: Math.max(offsets.current[next] - 8, 0),
			animated,
		});
	};
	const sectionLayout =
		(key: Section) => (event: { nativeEvent: { layout: { y: number } } }) => {
			offsets.current[key] = event.nativeEvent.layout.y;
			if (
				key === "payments" &&
				initialSection === "payments" &&
				!jumped.current
			) {
				jumped.current = true;
				jumpTo("payments", false);
			}
		};
	// The bar follows a manual scroll too, so it never names the wrong place.
	const followScroll = (y: number) => {
		const at = offsets.current;
		const next: Section =
			at.payments > 0 && y + 24 >= at.payments
				? "payments"
				: at.history > 0 && y + 24 >= at.history
					? "history"
					: "overview";
		if (next !== section) setSection(next);
	};

	const { data, isLoading, isError, error, refetch } = useModerationShop(id);
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
				onError: failed,
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
						showSuccess(
							t("moderation.paymentsHoldPlaced"),
							t("moderation.paymentsHoldPlacedMessage"),
						);
					},
					onError: failed,
				},
			);
		} else if (paymentsSheet.kind === "release") {
			releaseHold(
				{ shopId: String(id), holdId: paymentsSheet.holdId, note },
				{
					onSuccess: () => {
						setPaymentsSheet(null);
						showSuccess(
							t("moderation.paymentsHoldReleased"),
							t("moderation.paymentsHoldReleasedMessage"),
						);
					},
					onError: failed,
				},
			);
		} else if (paymentsSheet.kind === "approve") {
			approveAccount(
				{ shopId: String(id), accountId: paymentsSheet.accountId, note },
				{
					onSuccess: () => {
						setPaymentsSheet(null);
						showSuccess(
							t("moderation.paymentsAccountApproved"),
							t("moderation.paymentsAccountApprovedMessage"),
						);
					},
					onError: failed,
				},
			);
		} else if (paymentsSheet.kind === "reject") {
			rejectAccount(
				{ shopId: String(id), accountId: paymentsSheet.accountId, note },
				{
					onSuccess: () => {
						setPaymentsSheet(null);
						showSuccess(
							t("moderation.paymentsAccountRejected"),
							t("moderation.paymentsAccountRejectedMessage"),
						);
					},
					onError: failed,
				},
			);
		}
	};

	const paymentsSheetConfig: PaymentsSheetConfig | null = (() => {
		if (!paymentsSheet) return null;
		if (paymentsSheet.kind === "hold") {
			return {
				title: t("moderation.paymentsPlaceHoldSheetTitle"),
				subtitle: t("moderation.paymentsHoldSheetSubtitle"),
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
			{isLoading ? (
				<DetailSkeleton />
			) : isError || !data || !shop || !owner || !suspension ? (
				<LoadError
					title={t("common.error")}
					message={error ? resolveErrorMessage(error, t) : undefined}
					error={error}
					onRetry={() => void refetch()}
				/>
			) : (
				<>
					<View
						style={[styles.jumpBar, { borderBottomColor: c.border }]}
						accessibilityRole="tablist"
					>
						{SECTIONS.map((key) => {
							const on = section === key;
							return (
								<Pressable
									key={key}
									accessibilityRole="tab"
									accessibilityState={{ selected: on }}
									onPress={() => jumpTo(key)}
									style={[
										styles.jump,
										{ borderBottomColor: on ? k.linkText : "transparent" },
									]}
								>
									<Text
										style={[
											styles.jumpText,
											{
												color: on ? k.linkText : c.muted,
												fontFamily: on ? Fonts.bodyBold : Fonts.bodySemibold,
											},
										]}
									>
										{t(SECTION_LABEL[key])}
									</Text>
								</Pressable>
							);
						})}
					</View>
					<ScrollView
						ref={scrollRef}
						contentContainerStyle={[styles.content, centeredContent]}
						scrollEventThrottle={100}
						onScroll={(event) =>
							followScroll(event.nativeEvent.contentOffset.y)
						}
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
						<View
							onLayout={sectionLayout("history")}
							style={styles.sectionGroup}
						>
							<ShopHistoryList
								reports={data.reports}
								history={data.history}
								c={c}
								t={t}
							/>
						</View>
						<View
							onLayout={sectionLayout("payments")}
							style={styles.sectionGroup}
						>
							<ShopPaymentsAccountCard
								connectedAccount={data.payments.connectedAccount}
								payoutAccount={data.payments.payoutAccount}
								pendingAccounts={data.payments.pendingAccounts}
								actionable={actionable}
								decisionPending={decisionPending}
								onApprove={(accountId) =>
									openPaymentsSheet({ kind: "approve", accountId })
								}
								onReject={(accountId) =>
									openPaymentsSheet({ kind: "reject", accountId })
								}
								c={c}
								t={t}
							/>
							<ShopPaymentsHoldsCard
								holds={data.payments.holds}
								actionable={actionable}
								releasePending={releasePending}
								onPlaceHold={() => openPaymentsSheet({ kind: "hold" })}
								onReleaseHold={(holdId) =>
									openPaymentsSheet({ kind: "release", holdId })
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
						</View>
					</ScrollView>

					<ShopActionBar
						actionable={actionable}
						status={shop.status}
						suspendPending={suspendPending}
						liftPending={liftPending}
						onSuspend={() => {
							setSheetError(null);
							setSuspending(true);
						}}
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
						error={suspending ? sheetError : null}
						onConfirm={onSuspend}
						onClose={() => setSuspending(false)}
					/>

					{paymentsSheetConfig ? (
						<DecisionSheet
							visible={Boolean(paymentsSheet)}
							title={paymentsSheetConfig.title}
							subtitle={paymentsSheetConfig.subtitle}
							choices={paymentsSheetConfig.choices}
							choicesLabel={paymentsSheetConfig.choicesLabel}
							durations={paymentsSheetConfig.durations}
							durationsLabel={paymentsSheetConfig.durationsLabel}
							textLabel={t("moderation.internalNoteLabel")}
							textPlaceholder={t("moderation.internalNotePlaceholder")}
							confirmLabel={paymentsSheetConfig.confirmLabel}
							destructive={paymentsSheetConfig.destructive}
							pending={paymentsSheetConfig.pending}
							error={sheetError}
							onConfirm={onPaymentsSheetConfirm}
							onClose={() => setPaymentsSheet(null)}
						/>
					) : null}
				</>
			)}
		</ModerationScreen>
	);
}

const styles = StyleSheet.create({
	content: { padding: 16, gap: 14, paddingBottom: 24 },
	sectionGroup: { gap: 14 },
	jumpBar: {
		flexDirection: "row",
		paddingHorizontal: 8,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	jump: {
		flex: 1,
		minHeight: 48,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 8,
		borderBottomWidth: 2.5,
	},
	jumpText: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 20 },
});
