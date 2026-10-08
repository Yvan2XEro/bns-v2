"use client";

import { useTranslations } from "next-intl";
import { useReducer } from "react";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	useModerationDisputeAction,
	usePreviewDisputeOutcome,
} from "~/hooks/use-moderation-disputes";
import { resolveErrorMessage } from "~/lib/apiError";
import { DISPUTE_STATUS_LABELS } from "~/lib/case-status";
import {
	canResolve,
	type DecisionInput,
	decisionGuards,
	LIABLE_PARTIES,
	REASON_CODES,
	RESOLVE_OUTCOMES,
} from "~/lib/moderation-dispute-decision";
import type { ModerationDisputeSheet } from "../../../../api/src/contracts/disputes";

const initial: Omit<DecisionInput, "reasonCode"> & {
	reasonCode: (typeof REASON_CODES)[number];
	liableParty: (typeof LIABLE_PARTIES)[number];
} = {
	outcome: "resolved_split",
	refund: "",
	reasonCode: "other",
	returnRequired: false,
	returnShippingPaidBy: null,
	statementFr: "",
	statementEn: "",
	note: "",
	liableParty: "seller",
};
type FormState = typeof initial;

function reducer(state: FormState, patch: Partial<FormState>): FormState {
	return { ...state, ...patch };
}

const field =
	"w-full rounded-lg border border-[#CBD5E1] p-2 text-sm focus:border-[#1E40AF] focus:outline-none";

export function DisputeResolveSheet({
	sheet,
	viewerIsAdmin,
	open,
	onOpenChange,
}: {
	sheet: ModerationDisputeSheet;
	viewerIsAdmin: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useTranslations("ModerationDisputes");
	const tRoot = useTranslations();
	const id = sheet.dispute.id;
	const [form, patch] = useReducer(reducer, initial);
	const action = useModerationDisputeAction(id);
	const preview = usePreviewDisputeOutcome(id);

	const guards = decisionGuards(
		{
			amountAtStake: sheet.dispute.amountAtStake,
			moderatorRefundLimit: sheet.moderatorRefundLimit,
			proofEstablished: sheet.proofChecklist.some((row) => row.established),
			viewerIsAdmin,
		},
		form,
	);
	const ready = canResolve(guards, preview.data?.refundAmount ?? null);
	const has = (code: (typeof guards.guards)[number]) =>
		guards.guards.includes(code);

	const submit = () => {
		if (!ready) return;
		action.mutate(
			{
				action: "resolve",
				outcome: form.outcome,
				refundAmount: guards.refundAmount ?? 0,
				returnRequired: form.returnRequired,
				returnShippingPaidBy: form.returnRequired
					? form.returnShippingPaidBy
					: null,
				liableParty: form.liableParty,
				reasonCode: form.reasonCode,
				publicStatement: {
					fr: form.statementFr.trim(),
					en: form.statementEn.trim(),
				},
				note: form.note.trim(),
			},
			{ onSuccess: () => onOpenChange(false) },
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{t("resolveTitle")}</DialogTitle>
					<DialogDescription>{t("resolveHelp")}</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<label className="block space-y-1 text-sm">
						<span className="font-medium">{t("outcome")}</span>
						<select
							className={field}
							value={form.outcome}
							onChange={(e) => {
								const outcome = RESOLVE_OUTCOMES.find(
									(o) => o === e.target.value,
								);
								if (!outcome) return;
								patch({
									outcome,
									refund: outcome === "resolved_seller" ? "0" : "",
								});
								preview.reset();
							}}
						>
							{RESOLVE_OUTCOMES.map((o) => (
								<option key={o} value={o}>
									{tRoot(`Disputes.${DISPUTE_STATUS_LABELS[o]}`)}
								</option>
							))}
						</select>
					</label>
					<label className="block space-y-1 text-sm">
						<span className="font-medium">{t("refundAmount")}</span>
						<input
							inputMode="numeric"
							className={field}
							value={form.refund}
							onChange={(e) => {
								patch({ refund: e.target.value });
								preview.reset();
							}}
						/>
						<span className="block text-[#64748B] text-xs">
							{t("refundBounds", {
								min: guards.bounds.min.toLocaleString(),
								max: guards.bounds.max.toLocaleString(),
							})}
						</span>
					</label>
					{form.refund !== "" &&
					(has("refund_invalid") || has("refund_out_of_bounds")) ? (
						<p role="alert" className="text-red-700 text-sm">
							{t("guard.refund_out_of_bounds")}
						</p>
					) : null}
					{guards.adminOnly ? (
						<p
							role="alert"
							data-guard="admin_required"
							className="rounded-lg bg-amber-50 p-3 text-amber-900 text-sm"
						>
							{t(viewerIsAdmin ? "adminOnlyAdmin" : "guard.admin_required", {
								limit: sheet.moderatorRefundLimit.toLocaleString(),
							})}
						</p>
					) : null}
					<label className="block space-y-1 text-sm">
						<span className="font-medium">{t("liableParty")}</span>
						<select
							className={field}
							value={form.liableParty}
							onChange={(e) => {
								const liableParty = LIABLE_PARTIES.find(
									(p) => p === e.target.value,
								);
								if (liableParty) patch({ liableParty });
							}}
						>
							{LIABLE_PARTIES.map((p) => (
								<option key={p} value={p}>
									{t(`liability.${p}`)}
								</option>
							))}
						</select>
					</label>
					<label className="block space-y-1 text-sm">
						<span className="font-medium">{t("reasonCodeLabel")}</span>
						<select
							className={field}
							value={form.reasonCode}
							onChange={(e) => {
								const reasonCode = REASON_CODES.find(
									(c) => c === e.target.value,
								);
								if (reasonCode) patch({ reasonCode });
							}}
						>
							{REASON_CODES.map((c) => (
								<option key={c} value={c}>
									{t(`reasonCode.${c}`)}
								</option>
							))}
						</select>
					</label>
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={form.returnRequired}
							onChange={(e) =>
								patch({
									returnRequired: e.target.checked,
									returnShippingPaidBy: e.target.checked ? "seller" : null,
								})
							}
						/>
						{t("returnRequired")}
					</label>
					{form.returnRequired ? (
						<label className="block space-y-1 text-sm">
							<span className="font-medium">{t("returnShippingPayer")}</span>
							<select
								className={field}
								value={form.returnShippingPaidBy ?? "seller"}
								onChange={(e) =>
									patch({
										returnShippingPaidBy:
											e.target.value === "buyer" ? "buyer" : "seller",
									})
								}
							>
								<option value="seller">{t("liability.seller")}</option>
								<option value="buyer">{t("liability.buyer")}</option>
							</select>
						</label>
					) : null}
					<label className="block space-y-1 text-sm">
						<span className="font-medium">{t("statementFr")}</span>
						<textarea
							rows={2}
							className={field}
							value={form.statementFr}
							onChange={(e) => patch({ statementFr: e.target.value })}
						/>
					</label>
					<label className="block space-y-1 text-sm">
						<span className="font-medium">{t("statementEn")}</span>
						<textarea
							rows={2}
							className={field}
							value={form.statementEn}
							onChange={(e) => patch({ statementEn: e.target.value })}
						/>
					</label>
					<label className="block space-y-1 text-sm">
						<span className="font-medium">{t("internalNote")}</span>
						<textarea
							rows={3}
							className={field}
							value={form.note}
							onChange={(e) => patch({ note: e.target.value })}
						/>
					</label>
					{guards.overrideRequired ? (
						<p
							data-guard="override_required"
							className={`rounded-lg p-3 text-sm ${has("override_required") ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}
						>
							{t("overrideNotice")}
						</p>
					) : null}
					<Button
						type="button"
						variant="outline"
						disabled={!guards.canPreview || preview.isPending}
						onClick={() => {
							if (guards.refundAmount !== null)
								preview.mutate(guards.refundAmount);
						}}
					>
						{t("preview")}
					</Button>
					{preview.data ? (
						<div className="space-y-1 rounded-lg border border-[#E2E8F0] p-3 text-sm">
							<p className="font-semibold">
								{t("previewRefund", {
									amount: preview.data.refundAmount.toLocaleString(),
								})}
							</p>
							<p className="text-[#64748B]">
								{t("previewBreakdown", {
									goods: preview.data.breakdown.goods.toLocaleString(),
									delivery:
										preview.data.breakdown.outboundDelivery.toLocaleString(),
									protection:
										preview.data.breakdown.buyerProtectionFee.toLocaleString(),
								})}
							</p>
						</div>
					) : null}
					{guards.guards.length > 0 && preview.data ? (
						<ul className="list-disc pl-5 text-amber-900 text-sm">
							{guards.guards.map((g) => (
								<li key={g}>{t(`guard.${g}`)}</li>
							))}
						</ul>
					) : null}
					{preview.isError || action.isError ? (
						<p role="alert" className="text-red-700 text-sm">
							{resolveErrorMessage(
								action.error ?? preview.error,
								tRoot,
								tRoot("Disputes.actionError"),
							)}
						</p>
					) : null}
					<Button
						type="button"
						disabled={!ready || action.isPending}
						onClick={submit}
						className="w-full"
					>
						{t("confirmResolve")}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
