"use client";

import { useTranslations } from "next-intl";
import { useReducer } from "react";
import { DisputeQueueTable } from "~/components/moderation/dispute-queue-table";
import { useAuth } from "~/hooks/use-auth";
import { useModerationDisputes } from "~/hooks/use-moderation-disputes";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	DISPUTE_REASON_LABELS,
	DISPUTE_STATUS_LABELS,
} from "~/lib/case-status";
import {
	type DisputeQueueFilters,
	QUEUE_PAYMENT_FILTERS,
	QUEUE_STATUS_FILTERS,
} from "~/lib/moderation-disputes";

const REASONS = Object.keys(DISPUTE_REASON_LABELS) as Array<
	keyof typeof DISPUTE_REASON_LABELS
>;

function reducer(
	state: DisputeQueueFilters,
	patch: Partial<DisputeQueueFilters>,
): DisputeQueueFilters {
	return { ...state, ...patch };
}

const select = "h-9 rounded-lg border border-[#CBD5E1] bg-white px-2 text-sm";

export function QueueClient() {
	const t = useTranslations("ModerationDisputes");
	const tRoot = useTranslations();
	const { user } = useAuth();
	const [filters, patch] = useReducer(reducer, {});
	const queue = useModerationDisputes(filters);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
				<p className="text-[#64748B] text-sm">{t("subtitle")}</p>
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<select
					aria-label={t("filters.status")}
					className={select}
					value={filters.status ?? ""}
					onChange={(e) =>
						patch({
							status: QUEUE_STATUS_FILTERS.find((s) => s === e.target.value),
						})
					}
				>
					<option value="">{t("filters.statusAll")}</option>
					{QUEUE_STATUS_FILTERS.map((s) => (
						<option key={s} value={s}>
							{tRoot(`Disputes.${DISPUTE_STATUS_LABELS[s]}`)}
						</option>
					))}
				</select>
				<select
					aria-label={t("filters.reason")}
					className={select}
					value={filters.reason ?? ""}
					onChange={(e) =>
						patch({ reason: REASONS.find((r) => r === e.target.value) })
					}
				>
					<option value="">{t("filters.reasonAll")}</option>
					{REASONS.map((r) => (
						<option key={r} value={r}>
							{tRoot(`Disputes.${DISPUTE_REASON_LABELS[r]}`)}
						</option>
					))}
				</select>
				<select
					aria-label={t("filters.paymentMethod")}
					className={select}
					value={filters.paymentMethod ?? ""}
					onChange={(e) =>
						patch({
							paymentMethod: QUEUE_PAYMENT_FILTERS.find(
								(p) => p === e.target.value,
							),
						})
					}
				>
					<option value="">{t("filters.paymentAll")}</option>
					{QUEUE_PAYMENT_FILTERS.map((p) => (
						<option key={p} value={p}>
							{t(`payment.${p}`)}
						</option>
					))}
				</select>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={filters.overdue === true}
						onChange={(e) =>
							patch({ overdue: e.target.checked ? true : undefined })
						}
					/>
					{t("filters.overdue")}
				</label>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={filters.assigned === "me"}
						onChange={(e) =>
							patch({ assigned: e.target.checked ? "me" : undefined })
						}
					/>
					{t("filters.mine")}
				</label>
			</div>
			{queue.isPending ? (
				<output
					aria-label={t("loading")}
					className="block h-24 animate-pulse rounded-xl bg-[#F1F5F9]"
				/>
			) : queue.isError ? (
				<div
					role="alert"
					className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center"
				>
					<p className="font-semibold text-[#0F172A]">
						{resolveErrorMessage(queue.error, tRoot, t("loadError"))}
					</p>
					<button
						type="button"
						onClick={() => void queue.refetch()}
						className="mt-4 h-10 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white"
					>
						{t("retry")}
					</button>
				</div>
			) : queue.data.length === 0 ? (
				<p className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center text-[#64748B] text-sm">
					{t("empty")}
				</p>
			) : (
				<DisputeQueueTable rows={queue.data} viewerId={user?.id ?? null} />
			)}
		</div>
	);
}
