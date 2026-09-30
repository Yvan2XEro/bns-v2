"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AgeChip } from "~/components/moderation/age-chip";
import { SignalChip } from "~/components/moderation/signal-chip";
import { LevelBadge } from "~/components/shop/level-badge";
import { Button } from "~/components/ui/button";
import {
	moderationVerificationKeys,
	useVerificationDecision,
} from "~/hooks/use-moderation-verification";
import { resolveErrorMessage } from "~/lib/apiError";
import { relativeAge } from "~/lib/moderation-verification";
import { cn } from "~/lib/utils";
import {
	badgeForLevel,
	type ReviewerQueueRow,
	statusToneKey,
} from "~/lib/verification";

const STATUS_TONE_CLASSES: Record<string, string> = {
	positive: "text-emerald-700",
	negative: "text-red-700",
	warning: "text-[#92400E]",
	neutral: "text-[#64748B]",
};

/**
 * One request in the queue. Claiming is attempted, never precomputed: the
 * button shows whenever the row is unclaimed and submitted, and the server's
 * response — success or a lost-race 409 — is what decides the outcome. On
 * failure the queue is invalidated so the row reflects reality (it leaves
 * "to review" the moment someone else's claim lands), rather than a client
 * guess about who holds it.
 */
export function QueueRow({ row }: { row: ReviewerQueueRow }) {
	const t = useTranslations("Moderation");
	const tErrors = useTranslations();
	const queryClient = useQueryClient();
	const claim = useVerificationDecision();

	const age = relativeAge(row.submittedAt);
	const claimable = row.status === "submitted" && !row.assignee;

	return (
		<li className="flex flex-col gap-2 rounded-xl border border-[#E2E8F0] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex flex-wrap items-center gap-2">
				<Link
					href={`/moderation/verification/${row.id}`}
					className="font-semibold text-[#1E40AF] hover:underline"
				>
					{t("row.shop", { id: row.shopId ?? row.id })}
				</Link>
				<LevelBadge badge={badgeForLevel(row.requestedLevel)} size="sm" />
				<span
					className={cn(
						"font-medium text-xs",
						STATUS_TONE_CLASSES[statusToneKey(row.status)],
					)}
				>
					{t(`status.${row.status}`)}
				</span>
				{age && <AgeChip age={age} />}
				{row.signals.map((code) => (
					<SignalChip key={code} code={code} />
				))}
			</div>

			<div className="flex flex-wrap items-center gap-3">
				{claimable && (
					<Button
						type="button"
						size="sm"
						variant="secondary"
						disabled={claim.isPending}
						onClick={() =>
							claim.mutate(
								{ requestId: row.id, body: { action: "claim" } },
								{
									onError: () => {
										void queryClient.invalidateQueries({
											queryKey: moderationVerificationKeys.root,
										});
									},
								},
							)
						}
					>
						{claim.isPending ? t("row.claiming") : t("row.claim")}
					</Button>
				)}
				<Link
					href={`/moderation/verification/${row.id}`}
					className="font-medium text-[#1E40AF] text-sm hover:underline"
				>
					{t("row.view")}
				</Link>
			</div>

			{claim.isError && (
				<p role="alert" className="w-full text-red-600 text-xs">
					{resolveErrorMessage(claim.error, tErrors)}
				</p>
			)}
		</li>
	);
}
