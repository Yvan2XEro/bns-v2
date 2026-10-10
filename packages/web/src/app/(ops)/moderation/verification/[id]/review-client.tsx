"use client";

import { useTranslations } from "next-intl";
import { useReducer } from "react";
import { BusinessSummary } from "~/components/moderation/business-summary";
import { Checklist } from "~/components/moderation/checklist";
import { DecisionBar } from "~/components/moderation/decision-bar";
import { DecisionDialog } from "~/components/moderation/decision-dialog";
import { DocumentViewer } from "~/components/moderation/document-viewer";
import { KycSummary } from "~/components/moderation/kyc-summary";
import { SignalsPanel } from "~/components/moderation/signals-panel";
import { LevelBadge } from "~/components/shop/level-badge";
import {
	useVerificationDecision,
	useVerificationRequest,
} from "~/hooks/use-moderation-verification";
import { resolveErrorMessage } from "~/lib/apiError";
import { badgeForLevel } from "~/lib/verification";
import {
	availableActions,
	type ChecklistState,
	checklistComplete,
	type DecisionAction,
} from "~/lib/verification-decision";

interface State {
	activeAction: DecisionAction | null;
	checklist: ChecklistState;
}

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

export function ReviewClient({ id }: { id: string }) {
	const t = useTranslations("Moderation");
	const tRoot = useTranslations();
	const query = useVerificationRequest(id);
	const decide = useVerificationDecision();
	const [state, patch] = useReducer(reducer, {
		activeAction: null,
		checklist: {},
	});

	if (query.isError) {
		return (
			<div
				role="alert"
				className="rounded-xl border border-[#E2E8F0] bg-white px-6 py-12 text-center"
			>
				<p className="font-semibold text-[#0F172A]">
					{resolveErrorMessage(query.error, tRoot)}
				</p>
				<button
					type="button"
					onClick={() => query.refetch()}
					className="mt-4 h-10 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
				>
					{t("retry")}
				</button>
			</div>
		);
	}

	if (!query.data) {
		return <div className="h-96 animate-pulse rounded-2xl bg-[#F1F5F9]" />;
	}

	const detail = query.data;
	const { request, shop, owner } = detail;
	const actions = availableActions(detail.viewer, request.status);
	const approveDisabled =
		request.requestedLevel === 3 && !checklistComplete(state.checklist);

	function handleSelect(action: DecisionAction) {
		// Neither is reversible-by-mistake — release undoes a claim, and
		// claiming again undoes a release — so both go straight through with
		// no dialog to confirm in between.
		if (action === "claim") {
			decide.mutate({ requestId: id, body: { action: "claim" } });
			return;
		}
		if (action === "release") {
			decide.mutate({ requestId: id, body: { action: "release" } });
			return;
		}
		patch({ activeAction: action });
	}

	return (
		<div className="space-y-6 pb-24">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="font-semibold text-[#0F172A] text-xl">{shop.name}</h1>
					<p className="text-[#64748B] text-sm">
						{t("review.header.requestedLevel", {
							level: request.requestedLevel,
						})}{" "}
						· {t(`status.${request.status}`)}
					</p>
					{owner && (
						<p className="text-[#64748B] text-sm">
							{owner.name ?? owner.email}
						</p>
					)}
				</div>
				<LevelBadge badge={badgeForLevel(shop.level)} />
			</header>

			{decide.isError && (
				<p
					role="alert"
					className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
				>
					{resolveErrorMessage(decide.error, tRoot)}
				</p>
			)}

			<div className="grid gap-6 lg:grid-cols-2">
				<div className="space-y-6">
					<KycSummary kyc={request.kyc} />
					<BusinessSummary
						business={request.business}
						signals={request.reviewSignals}
					/>
					<SignalsPanel
						signals={request.reviewSignals}
						otherRequests={detail.otherRequests}
					/>
					{request.requestedLevel === 3 && (
						<Checklist
							value={state.checklist}
							onChange={(checklist) => patch({ checklist })}
						/>
					)}
				</div>
				<DocumentViewer documents={request.documents} />
			</div>

			<DecisionBar
				actions={actions}
				pending={decide.isPending}
				approveDisabled={approveDisabled}
				onSelect={handleSelect}
			/>

			<DecisionDialog
				action={state.activeAction}
				requestId={id}
				requestedLevel={request.requestedLevel}
				checklist={state.checklist}
				onClose={() => patch({ activeAction: null })}
			/>
		</div>
	);
}
