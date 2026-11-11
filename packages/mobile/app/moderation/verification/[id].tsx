import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useReducer } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { BusinessSummaryCard } from "@/src/components/moderation/BusinessSummaryCard";
import {
	type ChecklistState,
	ChecklistSwitches,
} from "@/src/components/moderation/ChecklistSwitches";
import {
	type DecisionResult,
	DecisionSheet,
} from "@/src/components/moderation/DecisionSheet";
import { DocumentList } from "@/src/components/moderation/DocumentList";
import { KycSummaryCard } from "@/src/components/moderation/KycSummaryCard";
import {
	DecisionBar,
	DecisionButton,
	type DecisionVariant,
	DetailSkeleton,
	InlineNotice,
	LoadError,
} from "@/src/components/moderation/ModerationKit";
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import { SignalsPanel } from "@/src/components/moderation/SignalsPanel";
import { useModerationTheme } from "@/src/components/moderation/theme";
import { tonesOf } from "@/src/components/moderation/tones";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import {
	moderationVerificationKeys,
	useVerificationDecision,
	useVerificationRequest,
} from "@/src/hooks/useModerationVerification";
import { useResponsive } from "@/src/hooks/useResponsive";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	decisionSchema,
	parseReasonCode,
} from "@/src/lib/moderationVerification";
import {
	availableActions,
	badgeForLevel,
	CHECKLIST_ITEMS,
	checklistComplete,
	type ReviewerAction,
} from "@/src/lib/verification";

const DESTRUCTIVE_ACTIONS = new Set<ReviewerAction>(["reject", "revoke"]);

/**
 * How each reviewer action looks in the bar, and where it sits: the neutral
 * moves first, refusals next, the forward decision last (rightmost, under
 * the thumb). Refusals are outlines because they open their own sheet.
 */
const ACTION_STYLE: Record<
	ReviewerAction,
	{
		variant: DecisionVariant;
		icon: React.ComponentProps<typeof DecisionButton>["icon"];
		order: number;
	}
> = {
	release: { variant: "secondary", icon: "arrow-undo-outline", order: 0 },
	request_info: {
		variant: "secondary",
		icon: "chatbubble-ellipses-outline",
		order: 1,
	},
	reject: { variant: "dangerOutline", icon: "close", order: 2 },
	revoke: { variant: "dangerOutline", icon: "ban-outline", order: 3 },
	claim: { variant: "primary", icon: "hand-left-outline", order: 4 },
	approve: { variant: "approve", icon: "checkmark", order: 5 },
};

interface State {
	activeAction: ReviewerAction | null;
	checklist: ChecklistState;
}

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

/** Every item confirmed, never partially — the API refuses an incomplete checklist just the same. */
function checklistPayload(checklist: ChecklistState): Record<string, boolean> {
	const entries: [string, boolean][] = CHECKLIST_ITEMS.map((item) => [
		item,
		checklist[item] === true,
	]);
	return Object.fromEntries(entries);
}

export default function VerificationReviewScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const requestId = String(id);
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t } = useTranslation();
	const { centeredContent } = useResponsive();
	const queryClient = useQueryClient();
	const query = useVerificationRequest(requestId);
	const decide = useVerificationDecision();
	const [state, patch] = useReducer(reducer, {
		activeAction: null,
		checklist: {},
	});

	const detail = query.data;
	const request = detail?.request;
	const actions =
		detail && request
			? [...availableActions(detail.viewer, request.status)].sort(
					(a, b) => ACTION_STYLE[a].order - ACTION_STYLE[b].order,
				)
			: [];
	const approveDisabled =
		request?.requestedLevel === 3 && !checklistComplete(state.checklist);
	const activeConfig = state.activeAction
		? decisionSchema(state.activeAction)
		: null;

	function invalidate() {
		queryClient.invalidateQueries({
			queryKey: moderationVerificationKeys.detail(requestId),
		});
		queryClient.invalidateQueries({
			queryKey: moderationVerificationKeys.root,
		});
	}

	function selectAction(action: ReviewerAction) {
		if (action === "claim" || action === "release") {
			decide.mutate({ id: requestId, action }, { onError: invalidate });
			return;
		}
		patch({ activeAction: action });
	}

	function confirmDecision(result: DecisionResult) {
		const action = state.activeAction;
		if (!action || !request || !activeConfig) return;
		// `DecisionSheet`'s picker only ever offers `activeConfig.reasons` as
		// buttons, but nothing upstream of this point re-checks that: parse
		// the choice against the same list before it ever reaches the network,
		// rather than trusting it was already constrained (I3).
		const reason = parseReasonCode(action, result.choice);
		if (!reason.ok) return;
		decide.mutate(
			{
				id: requestId,
				action,
				reasonCode: reason.reasonCode ?? undefined,
				sellerMessage:
					activeConfig.textKind === "sellerMessage" ? result.text : undefined,
				note:
					activeConfig.textKind === "note"
						? result.text || undefined
						: undefined,
				checklist:
					action === "approve" && request.requestedLevel === 3
						? checklistPayload(state.checklist)
						: undefined,
			},
			{
				onSuccess: () => patch({ activeAction: null }),
				onError: invalidate,
			},
		);
	}

	return (
		<ModerationScreen
			title={detail?.shop.name ?? t("moderation.verifReviewTitle")}
			subtitle={
				request
					? `${t("moderation.verifLevelRequest", { level: request.requestedLevel })} · ${t(`moderation.verifStatus_${request.status}`)}`
					: undefined
			}
			right={
				detail ? (
					<LevelBadge badge={badgeForLevel(detail.shop.level ?? 0)} size="sm" />
				) : undefined
			}
		>
			{query.isLoading ? (
				<DetailSkeleton />
			) : query.isError || !detail || !request ? (
				<LoadError
					title={t("common.error")}
					message={
						query.error ? resolveErrorMessage(query.error, t) : undefined
					}
					onRetry={() => void query.refetch()}
				/>
			) : (
				<>
					<ScrollView contentContainerStyle={[styles.scroll, centeredContent]}>
						{decide.isError ? (
							<InlineNotice text={resolveErrorMessage(decide.error, t)} />
						) : null}

						{/* Who is asking, one tap from their account sheet: a refusal
						    is often decided by what else that account has done. */}
						{detail.owner ? (
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={`${detail.owner.name || detail.owner.email}, ${t("moderation.openAccount")}`}
								onPress={() =>
									router.push(`/moderation/user/${detail.owner?.id}` as never)
								}
								style={({ pressed }) => [
									styles.ownerRow,
									{
										backgroundColor: c.card,
										borderColor: c.border,
										opacity: pressed ? 0.85 : 1,
									},
								]}
							>
								<Ionicons
									name="person-circle-outline"
									size={24}
									color={c.muted}
								/>
								<View style={styles.flex}>
									<Text style={[styles.owner, { color: c.text }]}>
										{detail.owner.name || detail.owner.email}
									</Text>
									<Text style={[styles.ownerLink, { color: k.linkText }]}>
										{t("moderation.openAccount")}
									</Text>
								</View>
								<Ionicons name="chevron-forward" size={18} color={c.muted} />
							</Pressable>
						) : null}

						{/* Red flags before the facts they qualify. */}
						<SignalsPanel
							signals={request.reviewSignals}
							otherRequests={detail.otherRequests}
						/>
						<KycSummaryCard kyc={request.kyc} />
						<BusinessSummaryCard
							business={request.business}
							signals={request.reviewSignals}
						/>
						{request.requestedLevel === 3 ? (
							<ChecklistSwitches
								value={state.checklist}
								onChange={(checklist) => patch({ checklist })}
							/>
						) : null}
						<DocumentList documents={request.documents} />
					</ScrollView>

					{actions.length > 0 ? (
						<DecisionBar
							wrap
							note={
								approveDisabled
									? {
											text: t("moderation.verifApproveChecklistIncomplete"),
											tone: "warning",
										}
									: null
							}
						>
							{actions.map((action) => {
								const look = ACTION_STYLE[action];
								const quick = action === "claim" || action === "release";
								return (
									<DecisionButton
										key={action}
										variant={look.variant}
										icon={look.icon}
										label={t(`moderation.verifAction_${action}`)}
										pending={quick && decide.isPending}
										disabled={
											decide.isPending ||
											(action === "approve" && approveDisabled)
										}
										onPress={() => selectAction(action)}
									/>
								);
							})}
						</DecisionBar>
					) : null}

					<DecisionSheet
						visible={state.activeAction !== null}
						title={
							state.activeAction
								? t(`moderation.verifSheetTitle_${state.activeAction}`)
								: ""
						}
						subtitle={
							state.activeAction
								? t(`moderation.verifSheetSubtitle_${state.activeAction}`)
								: undefined
						}
						choices={activeConfig?.reasons?.map((reason) => ({
							value: reason,
							label: t(`moderation.verifReasonCode_${reason}`),
						}))}
						choicesLabel={t("moderation.verifReasonLabel")}
						textLabel={
							activeConfig?.textKind === "sellerMessage"
								? t("moderation.verifSellerMessageLabel")
								: activeConfig?.textKind === "note"
									? t("moderation.internalNoteLabel")
									: undefined
						}
						textPlaceholder={
							activeConfig?.textKind === "sellerMessage"
								? t("moderation.verifSellerMessagePlaceholder")
								: activeConfig?.textKind === "note"
									? t("moderation.internalNotePlaceholder")
									: undefined
						}
						textRequired={activeConfig?.textRequired ?? false}
						confirmLabel={
							state.activeAction
								? t(`moderation.verifConfirm_${state.activeAction}`)
								: ""
						}
						destructive={
							state.activeAction
								? DESTRUCTIVE_ACTIONS.has(state.activeAction)
								: false
						}
						pending={decide.isPending}
						onConfirm={confirmDecision}
						onClose={() => patch({ activeAction: null })}
					/>
				</>
			)}
		</ModerationScreen>
	);
}

const styles = StyleSheet.create({
	scroll: { padding: 16, gap: 14, paddingBottom: 24 },
	flex: { flex: 1 },
	ownerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 60,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 14,
		paddingVertical: 10,
	},
	owner: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	ownerLink: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodySemibold },
});
