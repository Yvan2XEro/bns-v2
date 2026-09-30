import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useReducer } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
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
import { ModerationScreen } from "@/src/components/moderation/ModerationScreen";
import { SignalsPanel } from "@/src/components/moderation/SignalsPanel";
import { useModerationTheme } from "@/src/components/moderation/theme";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import {
	moderationVerificationKeys,
	useVerificationDecision,
	useVerificationRequest,
} from "@/src/hooks/useModerationVerification";
import { useResponsive } from "@/src/hooks/useResponsive";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { decisionSchema } from "@/src/lib/moderationVerification";
import {
	availableActions,
	badgeForLevel,
	CHECKLIST_ITEMS,
	checklistComplete,
	type ReviewerAction,
} from "@/src/lib/verification";

const DESTRUCTIVE_ACTIONS = new Set<ReviewerAction>(["reject", "revoke"]);

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
		detail && request ? availableActions(detail.viewer, request.status) : [];
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
		decide.mutate(
			{
				id: requestId,
				action,
				reasonCode: activeConfig.reasons
					? (result.choice ?? undefined)
					: undefined,
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
			{query.isLoading || !detail || !request ? (
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			) : (
				<>
					<ScrollView contentContainerStyle={[styles.scroll, centeredContent]}>
						{detail.owner ? (
							<Text style={[styles.owner, { color: c.muted }]}>
								{detail.owner.name || detail.owner.email}
							</Text>
						) : null}

						{decide.isError ? (
							<Text
								accessibilityRole="alert"
								style={[
									styles.banner,
									{ color: c.danger, backgroundColor: c.dangerSoft },
								]}
							>
								{resolveErrorMessage(decide.error, t)}
							</Text>
						) : null}

						<KycSummaryCard kyc={request.kyc} />
						<BusinessSummaryCard
							business={request.business}
							signals={request.reviewSignals}
						/>
						<SignalsPanel
							signals={request.reviewSignals}
							otherRequests={detail.otherRequests}
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
						<View
							style={[
								styles.actionBar,
								{ backgroundColor: c.card, borderTopColor: c.border },
							]}
						>
							{approveDisabled ? (
								<Text style={[styles.checklistHint, { color: c.warning }]}>
									{t("moderation.verifApproveChecklistIncomplete")}
								</Text>
							) : null}
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								contentContainerStyle={{ gap: 8 }}
							>
								{actions.map((action) => {
									const disabled =
										decide.isPending ||
										(action === "approve" && approveDisabled);
									return (
										<Pressable
											key={action}
											accessibilityRole="button"
											accessibilityLabel={t(`moderation.verifAction_${action}`)}
											disabled={disabled}
											onPress={() => selectAction(action)}
											style={[
												styles.actionBtn,
												{
													backgroundColor: DESTRUCTIVE_ACTIONS.has(action)
														? c.danger
														: c.primary,
													opacity: disabled ? 0.5 : 1,
												},
											]}
										>
											<Text style={styles.actionText}>
												{t(`moderation.verifAction_${action}`)}
											</Text>
										</Pressable>
									);
								})}
							</ScrollView>
						</View>
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
	owner: { fontSize: 13, fontFamily: Fonts.body },
	banner: {
		fontSize: 13,
		fontFamily: Fonts.body,
		borderRadius: 10,
		padding: 10,
	},
	actionBar: {
		paddingHorizontal: 16,
		paddingVertical: 12,
		gap: 8,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	checklistHint: { fontSize: 12, fontFamily: Fonts.body },
	actionBtn: {
		minHeight: 44,
		paddingHorizontal: 18,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	actionText: { fontSize: 14, fontFamily: Fonts.bodySemibold, color: "#fff" },
});
