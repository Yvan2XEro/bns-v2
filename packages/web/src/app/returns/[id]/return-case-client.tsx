"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useReturnAction, useReturnCase } from "~/hooks/use-returns";
import {
	RETURN_ACTION_LABELS,
	RETURN_CASE_STATUS_LABELS,
	RETURN_PAYER_LABELS,
} from "~/lib/case-status";
import type { JsonReturnAction } from "~/lib/return-actions";
import { returnFlowState } from "~/lib/return-flow";
import type { ReturnAction } from "../../../../../api/src/contracts/returns";
import { SellerReturnActions } from "./seller-return-actions";

const BUYER_ACTIONS: ReadonlySet<JsonReturnAction> = new Set([
	"ship",
	"accept_deduction",
	"contest_deduction",
	"confirm_refund",
	"contest_refund",
	"cancel",
]);

function isBuyerAction(action: ReturnAction): action is JsonReturnAction {
	return action !== "upload_evidence" && BUYER_ACTIONS.has(action);
}

export function ReturnCaseClient({ caseId }: { caseId: string }) {
	const locale = useLocale();
	const t = useTranslations("Returns");
	const query = useReturnCase(caseId);
	const action = useReturnAction();

	if (query.isPending) {
		return (
			<main aria-busy="true" className="mx-auto max-w-4xl space-y-4 px-4 py-8">
				<div className="h-9 w-56 animate-pulse rounded-lg bg-[#E2E8F0]" />
				<div className="h-40 animate-pulse rounded-2xl bg-[#F1F5F9]" />
				<div className="h-56 animate-pulse rounded-2xl bg-[#F1F5F9]" />
			</main>
		);
	}
	if (query.isError || !query.data) {
		return (
			<main className="mx-auto max-w-4xl px-4 py-12">
				<div
					role="alert"
					className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800"
				>
					<p className="font-semibold">{t("caseLoadError")}</p>
					<button
						type="button"
						onClick={() => void query.refetch()}
						className="mt-3 min-h-11 underline"
					>
						{t("retry")}
					</button>
				</div>
			</main>
		);
	}

	const view = query.data;
	const flow = returnFlowState(view);
	const date = (value: string | null) =>
		value
			? new Intl.DateTimeFormat(locale, {
					dateStyle: "medium",
					timeStyle: "short",
				}).format(new Date(value))
			: t("noDeadline");
	const submit = (name: JsonReturnAction) => {
		const body =
			name === "ship" && view.returnMethod
				? { returnMethod: view.returnMethod }
				: undefined;
		action.mutate({ caseId: view.id, action: name, body });
	};

	return (
		<main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
			<Link
				href="/account/returns"
				className="inline-flex min-h-11 items-center text-[#1E40AF] text-sm hover:underline"
			>
				{t("backToReturns")}
			</Link>
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="text-[#64748B] text-sm">
						{t("orderNumber", { number: view.orderNumber })}
					</p>
					<h1 className="mt-1 font-bold text-2xl text-[#0F172A]">
						{t("caseTitle")} {view.number}
					</h1>
				</div>
				<span className="rounded-full bg-[#EFF6FF] px-3 py-1.5 font-medium text-[#1E40AF] text-sm">
					{t(RETURN_CASE_STATUS_LABELS[view.status])}
				</span>
			</header>

			<section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
				<h2 className="font-semibold text-[#0F172A]">{t("progressTitle")}</h2>
				<p className="mt-1 text-[#64748B] text-sm">{t(`step.${flow.step}`)}</p>
				{flow.nextDeadline && (
					<p className="mt-3 text-[#334155] text-sm">
						{t("nextDeadline", { date: date(flow.nextDeadline) })}
					</p>
				)}
				<p className="mt-2 text-[#334155] text-sm">
					{t("returnShippingPayer", {
						payer: t(RETURN_PAYER_LABELS[flow.returnShippingPaidBy]),
					})}
				</p>
			</section>

			<section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
				<h2 className="font-semibold text-[#0F172A]">{t("itemsTitle")}</h2>
				<ul className="mt-3 divide-y divide-[#E2E8F0]">
					{view.items.map((item) => (
						<li
							key={item.orderItemId}
							className="flex justify-between gap-4 py-3 text-sm"
						>
							<span className="min-w-0 truncate text-[#334155]">
								{item.title} × {item.quantity}
							</span>
							<span className="shrink-0 text-right text-[#0F172A]">
								<span className="block font-medium">
									{item.unitPrice.toLocaleString()} XAF
								</span>
								<span className="block text-[#64748B] text-xs">
									{t("unitPrice")}
								</span>
							</span>
						</li>
					))}
				</ul>
				{view.reasonText && (
					<p className="mt-3 text-[#64748B] text-sm">{view.reasonText}</p>
				)}
			</section>

			<section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
				<h2 className="font-semibold text-[#0F172A]">{t("refundTitle")}</h2>
				<dl className="mt-3 space-y-2 text-sm">
					<AmountLine
						label={t("refundGoods")}
						amount={view.refund.breakdown.goods}
					/>
					<AmountLine
						label={t("refundDelivery")}
						amount={view.refund.breakdown.outboundDelivery}
					/>
					<AmountLine
						label={t("refundShipping")}
						amount={view.refund.breakdown.returnShipping}
					/>
					<AmountLine
						label={t("refundDeduction")}
						amount={-view.refund.breakdown.deduction}
					/>
					<div className="flex justify-between border-[#E2E8F0] border-t pt-3 font-semibold text-[#0F172A]">
						<dt>{t("refundTotal")}</dt>
						<dd>{view.refund.amount.toLocaleString()} XAF</dd>
					</div>
				</dl>
			</section>

			<section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
				<h2 className="font-semibold text-[#0F172A]">{t("timelineTitle")}</h2>
				<ol className="mt-4 space-y-4 border-[#CBD5E1] border-l pl-4">
					{view.timeline.map((entry, index) => (
						<li
							key={`${entry.status}-${entry.at}-${index}`}
							className="relative"
						>
							<span
								aria-hidden="true"
								className="-left-[21px] absolute top-1.5 h-2.5 w-2.5 rounded-full bg-[#2563EB]"
							/>
							<p className="font-medium text-[#0F172A] text-sm">
								{t(RETURN_CASE_STATUS_LABELS[entry.status])}
							</p>
							<p className="text-[#64748B] text-xs">{date(entry.at)}</p>
							{entry.note && (
								<p className="mt-1 text-[#475569] text-sm">{entry.note}</p>
							)}
						</li>
					))}
				</ol>
			</section>

			{view.allowedActions.some(isBuyerAction) && (
				<section
					aria-label={t("actionsTitle")}
					className="rounded-2xl border border-[#E2E8F0] bg-white p-5"
				>
					<h2 className="font-semibold text-[#0F172A]">{t("actionsTitle")}</h2>
					<div className="mt-3 flex flex-wrap gap-2">
						{view.allowedActions.filter(isBuyerAction).map((item) => (
							<button
								key={item}
								type="button"
								disabled={action.isPending}
								onClick={() => submit(item)}
								className="min-h-11 rounded-xl border border-[#CBD5E1] px-4 font-medium text-[#1E293B] text-sm hover:bg-[#F8FAFC] disabled:opacity-50"
							>
								{t(RETURN_ACTION_LABELS[item])}
							</button>
						))}
					</div>
					{action.isError && (
						<p role="alert" className="mt-3 text-red-700 text-sm">
							{t("actionError")}
						</p>
					)}
					{action.isSuccess && (
						<output className="mt-3 block text-green-700 text-sm">
							{t("actionSuccess")}
						</output>
					)}
				</section>
			)}
			<SellerReturnActions view={view} />
		</main>
	);
}

function AmountLine({ label, amount }: { label: string; amount: number }) {
	return (
		<div className="flex justify-between gap-4 text-[#475569]">
			<dt>{label}</dt>
			<dd className="shrink-0">{amount.toLocaleString()} XAF</dd>
		</div>
	);
}
