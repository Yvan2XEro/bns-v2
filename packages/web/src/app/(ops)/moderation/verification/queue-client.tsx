"use client";

import { useTranslations } from "next-intl";
import { useCallback, useReducer } from "react";
import { QueueRow } from "~/components/moderation/queue-row";
import { QueueTabs } from "~/components/moderation/queue-tabs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import type {
	ModerationQueue,
	VerificationQueueFilters,
} from "~/hooks/use-moderation-verification";
import { useVerificationQueue } from "~/hooks/use-moderation-verification";
import { resolveErrorMessage } from "~/lib/apiError";
import { queueTabs } from "~/lib/moderation-verification";
import type { ReviewSignalCode } from "~/lib/verification";

const SIGNAL_CODES: ReviewSignalCode[] = [
	"identity_reused",
	"name_mismatch",
	"underage",
	"kyc_declined",
	"kyc_review",
	"document_reused",
	"rccm_reused",
	"niu_reused",
	"niu_format",
];

interface State {
	queue: ModerationQueue;
	level: 2 | 3 | undefined;
	signal: ReviewSignalCode | undefined;
}

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

function isReviewSignalCode(value: string): value is ReviewSignalCode {
	return SIGNAL_CODES.some((code) => code === value);
}

/**
 * The reviewer queue. Never gated by `verificationEnabled`: a review already
 * in flight must finish while intake is paused, so this screen only ever
 * asks `useVerificationQueue` — it never reads the flag.
 */
export function QueueClient() {
	const t = useTranslations("Moderation");
	const tErrors = useTranslations();
	const [state, patch] = useReducer(reducer, {
		queue: "to_review",
		level: undefined,
		signal: undefined,
	});

	const filters: VerificationQueueFilters = {
		level: state.level,
		signal: state.signal,
	};

	// Kept separate from the active list query so the "to review" tab always
	// carries its count, even while another tab or filter is active. When the
	// active tab already is "to review" with no filters, this shares the same
	// query key as `active` below and TanStack Query dedupes the request.
	const tabCount = useVerificationQueue("to_review", {});
	const active = useVerificationQueue(state.queue, filters);

	const tabs = queueTabs(
		tabCount.data ? { pendingVerifications: tabCount.data.total } : undefined,
	);

	const retry = useCallback(() => {
		void active.refetch();
	}, [active]);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
				<p className="text-[#64748B] text-sm">{t("subtitle")}</p>
			</div>

			<QueueTabs
				tabs={tabs}
				active={state.queue}
				onChange={(queue) => patch({ queue })}
			/>

			<div className="flex flex-wrap gap-3">
				<Select
					value={state.level ? String(state.level) : "all"}
					onValueChange={(value) => {
						if (value === "2") patch({ level: 2 });
						else if (value === "3") patch({ level: 3 });
						else patch({ level: undefined });
					}}
				>
					<SelectTrigger className="h-9 w-44">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{t("filters.levelAll")}</SelectItem>
						<SelectItem value="2">{t("filters.level2")}</SelectItem>
						<SelectItem value="3">{t("filters.level3")}</SelectItem>
					</SelectContent>
				</Select>

				<Select
					value={state.signal ?? "all"}
					onValueChange={(value) =>
						patch({
							signal: isReviewSignalCode(value) ? value : undefined,
						})
					}
				>
					<SelectTrigger className="h-9 w-56">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{t("filters.signalAll")}</SelectItem>
						{SIGNAL_CODES.map((code) => (
							<SelectItem key={code} value={code}>
								{t(`signal.${code}`)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{active.isPending && (
				<output aria-label={t("loading")} className="block space-y-2">
					{Array.from({ length: 4 }, (_, index) => (
						<span
							key={`skeleton-${index}`}
							className="block h-16 animate-pulse rounded-xl bg-[#F1F5F9]"
						/>
					))}
				</output>
			)}

			{active.isError && (
				<div
					role="alert"
					className="flex flex-col items-center rounded-xl border border-[#E2E8F0] bg-white px-6 py-12 text-center"
				>
					<p className="font-semibold text-[#0F172A]">
						{resolveErrorMessage(active.error, tErrors, t("errorTitle"))}
					</p>
					<button
						type="button"
						onClick={retry}
						className="mt-4 h-10 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
					>
						{t("retry")}
					</button>
				</div>
			)}

			{!active.isPending && !active.isError && active.data && (
				<div aria-busy={active.isFetching}>
					{active.data.items.length === 0 ? (
						<p className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center text-[#64748B] text-sm">
							{t("empty")}
						</p>
					) : (
						<ul className="space-y-3">
							{active.data.items.map((row) => (
								<QueueRow key={row.id} row={row} />
							))}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}
