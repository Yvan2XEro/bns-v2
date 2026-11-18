"use client";

import { Download, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useSellerPayments } from "~/hooks/use-seller-payments";
import { resolveErrorMessage } from "~/lib/apiError";
import { downloadCsv } from "~/lib/csv";
import { PAYOUT_STATUSES } from "~/lib/payment-status";
import { paymentsCsv } from "~/lib/payments-export";
import { AmountStrip } from "./amount-strip";
import { CommissionInvoicesCard } from "./commission-invoices-card";
import { HoldList } from "./hold-list";
import { OrderBreakdown } from "./order-breakdown";
import { PayoutAccountCard } from "./payout-account-card";
import { PayoutsTable } from "./payouts-table";

const HEADER_BUTTON =
	"inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-semibold text-ink text-sm hover:border-[var(--shop-accent-border,var(--c-brand-line))] disabled:cursor-not-allowed disabled:opacity-60";

const FLOW_STEPS = ["1", "2", "3", "4"] as const;

function MoneyFlow() {
	const tPayments = useTranslations("PaymentsPage");
	return (
		<section
			aria-labelledby="money-flow-title"
			className="overflow-hidden rounded-2xl border border-line bg-surface"
		>
			<h2
				id="money-flow-title"
				className="border-subtle border-b px-[18px] py-3.5 font-bold text-base text-ink"
			>
				{tPayments("flowTitle")}
			</h2>
			<ol className="space-y-3 px-[18px] py-3.5">
				{FLOW_STEPS.map((step) => (
					<li key={step} className="flex items-start gap-2.5">
						<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ECFEFF] font-extrabold text-[#0E7490] text-xs">
							{step}
						</span>
						<div>
							<p className="font-semibold text-ink text-sm">
								{tPayments(`flow.${step}.title`)}
							</p>
							<p className="text-ink-muted text-xs leading-[17px]">
								{tPayments(`flow.${step}.body`)}
							</p>
						</div>
					</li>
				))}
			</ol>
		</section>
	);
}

export function PaymentsClient({ shopId }: { shopId: string }) {
	const tPayments = useTranslations("Payments");
	const tPage = useTranslations("PaymentsPage");
	const tRoot = useTranslations();
	const payments = useSellerPayments(shopId);

	if (payments.isPending) return <LoadingRows rows={4} />;
	if (payments.isError) {
		return (
			<LoadError
				title={`${tPayments("seller_title")} — ${resolveErrorMessage(payments.error, tRoot)}`}
				onRetry={() => void payments.refetch()}
			/>
		);
	}

	const view = payments.data;
	const exportCsv = () =>
		downloadCsv(
			`${tPage("exportFilename")}.csv`,
			paymentsCsv(view, {
				header: [
					tPage("csv.kind"),
					tPage("csv.reference"),
					tPage("csv.date"),
					tPage("csv.gross"),
					tPayments("seller_colCommission"),
					tPayments("seller_colVat"),
					tPage("csv.fee"),
					tPage("csv.net"),
					tPayments("seller_colStatus"),
					tPage("csv.currency"),
				],
				payoutKind: tPage("csv.payout"),
				orderKind: tPage("csv.order"),
				payoutStatus: (status) => tPayments(PAYOUT_STATUSES[status]),
			}),
		);

	return (
		<div className="space-y-[18px]">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="font-bold text-2xl text-ink">
						{tPayments("seller_title")}
					</h1>
					<p className="text-ink-muted text-sm">{tPage("subtitle")}</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<button type="button" onClick={exportCsv} className={HEADER_BUTTON}>
						<Download aria-hidden="true" className="h-4 w-4" />
						{tPage("exportAccounting")}
					</button>
				</div>
			</div>

			<AmountStrip amounts={view.amounts} />

			<p className="flex gap-2.5 rounded-xl border border-[#A5F3FC] bg-[#ECFEFF] p-3.5 text-[#155E75] text-sm leading-5">
				<ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
				<span>
					<strong>{tPage("custodyLead")}</strong> {tPage("custodyBody")}
				</span>
			</p>

			<HoldList holds={view.holds} />

			<div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_380px]">
				<div className="min-w-0 space-y-[18px]">
					<PayoutsTable
						payouts={view.payouts}
						rates={view.rates}
						onExport={exportCsv}
					/>
					<CommissionInvoicesCard shopId={shopId} />
					<OrderBreakdown orders={view.orders} rates={view.rates} />
				</div>
				<div className="space-y-[18px]">
					<PayoutAccountCard shopId={shopId} />
					<MoneyFlow />
					<Link
						href="/seller/payments/setup"
						className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-[18px] py-3.5 font-semibold text-[var(--shop-accent-text,var(--c-brand))] text-sm hover:border-[var(--shop-accent-border,var(--c-brand-line))]"
					>
						<Settings aria-hidden="true" className="h-4 w-4" />
						{tPage("setupLink")}
					</Link>
				</div>
			</div>
		</div>
	);
}
