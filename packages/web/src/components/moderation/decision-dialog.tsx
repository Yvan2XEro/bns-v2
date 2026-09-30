"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import {
	useVerificationDecision,
	type VerificationDecisionAction,
} from "~/hooks/use-moderation-verification";
import { resolveErrorMessage } from "~/lib/apiError";
import { moderationVerificationKeys } from "~/lib/query-keys";
import {
	REJECT_REASONS,
	REQUEST_INFO_REASONS,
	REVOKE_REASONS,
} from "~/lib/verification";
import {
	type ChecklistState,
	checklistComplete,
	type DecisionAction,
	decisionSchema,
} from "~/lib/verification-decision";

const REASONS_BY_ACTION: Partial<Record<DecisionAction, readonly string[]>> = {
	request_info: REQUEST_INFO_REASONS,
	reject: REJECT_REASONS,
	revoke: REVOKE_REASONS,
};

/** Approve and reject are not reversible by the reviewer, so both confirm. */
const CONFIRM_ACTIONS = new Set<DecisionAction>(["approve", "reject"]);

interface FormValues {
	reasonCode: string;
	sellerMessage: string;
	note: string;
}

function toDecisionBody(
	action: DecisionAction,
	values: FormValues,
	checklist: ChecklistState,
	requestedLevel: 2 | 3,
): VerificationDecisionAction {
	switch (action) {
		case "claim":
			return { action: "claim" };
		case "release":
			return { action: "release" };
		case "request_info":
			return {
				action: "request_info",
				reasonCode: values.reasonCode,
				sellerMessage: values.sellerMessage,
			};
		case "approve":
			return {
				action: "approve",
				note: values.note || null,
				checklist: requestedLevel === 3 ? checklist : undefined,
			};
		case "reject":
			return {
				action: "reject",
				reasonCode: values.reasonCode,
				sellerMessage: values.sellerMessage,
				note: values.note || null,
			};
		case "revoke":
			return {
				action: "revoke",
				reasonCode: values.reasonCode,
				note: values.note || null,
			};
	}
}

function DecisionForm({
	action,
	requestId,
	requestedLevel,
	checklist,
	onClose,
}: {
	action: DecisionAction;
	requestId: string;
	requestedLevel: 2 | 3;
	checklist: ChecklistState;
	onClose: () => void;
}) {
	const t = useTranslations("Moderation");
	const tRoot = useTranslations();
	const decide = useVerificationDecision();
	const queryClient = useQueryClient();

	const needsReason =
		action === "request_info" || action === "reject" || action === "revoke";
	const needsSellerMessage = action === "request_info" || action === "reject";
	const allowNote =
		action === "approve" || action === "reject" || action === "revoke";
	const reasons = REASONS_BY_ACTION[action] ?? [];
	const checklistBlocksApprove =
		action === "approve" &&
		requestedLevel === 3 &&
		!checklistComplete(checklist);

	const form = useForm<FormValues>({
		resolver: zodResolver(decisionSchema(action)),
		defaultValues: { reasonCode: "", sellerMessage: "", note: "" },
	});

	const onSubmit = form.handleSubmit(async (values) => {
		try {
			await decide.mutateAsync({
				requestId,
				body: toDecisionBody(action, values, checklist, requestedLevel),
			});
			onClose();
		} catch (error) {
			// The request may have moved on (someone else decided — or claimed —
			// while this dialog was open) or this moderator may no longer act on
			// it. Either way the server's refusal is shown as-is and both the
			// detail and the queue are refetched (`root` covers both, the same
			// invalidation `queue-row.tsx` uses on a lost claim race), rather than
			// leaving the queue listing this request with a still-live Claim
			// button until `staleTime` lapses.
			void queryClient.invalidateQueries({
				queryKey: moderationVerificationKeys.root,
			});
			form.setError("root", {
				type: "server",
				message: resolveErrorMessage(error, tRoot),
			});
		}
	});

	return (
		<form onSubmit={onSubmit} noValidate>
			<DialogHeader>
				<DialogTitle>{t(`review.dialog.${action}.title`)}</DialogTitle>
				<DialogDescription>
					{t(`review.dialog.${action}.description`)}
				</DialogDescription>
			</DialogHeader>

			<div className="space-y-4 py-4">
				{needsReason && (
					<div className="space-y-2">
						<Label htmlFor={`reason-${action}`}>
							{t("review.dialog.reasonLabel")}
						</Label>
						<Controller
							control={form.control}
							name="reasonCode"
							render={({ field }) => (
								<Select value={field.value} onValueChange={field.onChange}>
									<SelectTrigger id={`reason-${action}`}>
										<SelectValue
											placeholder={t("review.dialog.reasonPlaceholder")}
										/>
									</SelectTrigger>
									<SelectContent>
										{reasons.map((reason) => (
											<SelectItem key={reason} value={reason}>
												{t(`review.reasonCode.${reason}`)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
						/>
						{form.formState.errors.reasonCode && (
							<p className="text-red-700 text-xs">
								{t("review.dialog.reasonRequired")}
							</p>
						)}
					</div>
				)}

				{needsSellerMessage && (
					<div className="space-y-2">
						<Label htmlFor={`seller-message-${action}`}>
							{t("review.dialog.sellerMessageLabel")}
						</Label>
						<Textarea
							id={`seller-message-${action}`}
							{...form.register("sellerMessage")}
							placeholder={t("review.dialog.sellerMessagePlaceholder")}
						/>
						<p className="text-[#64748B] text-xs">
							{t("review.dialog.sellerMessageHint")}
						</p>
						{form.formState.errors.sellerMessage && (
							<p className="text-red-700 text-xs">
								{t("review.dialog.sellerMessageRequired")}
							</p>
						)}
					</div>
				)}

				{allowNote && (
					<div className="space-y-2">
						<Label htmlFor={`note-${action}`}>
							{t("review.dialog.noteLabel")}
						</Label>
						<Textarea id={`note-${action}`} {...form.register("note")} />
						<p className="text-[#64748B] text-xs">
							{t("review.dialog.noteHint")}
						</p>
					</div>
				)}

				{checklistBlocksApprove && (
					<p className="rounded-lg bg-[#FEF3C7] px-3 py-2 text-[#92400E] text-sm">
						{t("review.dialog.checklistIncomplete")}
					</p>
				)}

				{CONFIRM_ACTIONS.has(action) && (
					<p className="text-[#64748B] text-xs">
						{t("review.dialog.irreversible")}
					</p>
				)}

				{form.formState.errors.root && (
					<p
						role="alert"
						className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
					>
						{form.formState.errors.root.message}
					</p>
				)}
			</div>

			<DialogFooter>
				<Button type="button" variant="outline" onClick={onClose}>
					{t("review.dialog.cancel")}
				</Button>
				<Button
					type="submit"
					disabled={decide.isPending || checklistBlocksApprove}
				>
					{t(`review.dialog.${action}.confirm`)}
				</Button>
			</DialogFooter>
		</form>
	);
}

export function DecisionDialog({
	action,
	requestId,
	requestedLevel,
	checklist,
	onClose,
}: {
	action: DecisionAction | null;
	requestId: string;
	requestedLevel: 2 | 3;
	checklist: ChecklistState;
	onClose: () => void;
}) {
	return (
		<Dialog open={action !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				{action && (
					<DecisionForm
						key={action}
						action={action}
						requestId={requestId}
						requestedLevel={requestedLevel}
						checklist={checklist}
						onClose={onClose}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
