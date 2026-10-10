"use client";

import { ArrowLeftRight, CreditCard } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useResellerFinance } from "~/hooks/use-resale";
import { formatXaf } from "~/lib/order-money";

export function ResellerFinanceClient({ shopId }: { shopId: string }) {
	const t = useTranslations("SellerResale");
	const locale = useLocale().startsWith("fr") ? "fr" : "en";
	const query = useResellerFinance(shopId);
	const data = query.data;

	return (
		<section className="mx-auto w-full max-w-5xl space-y-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="font-semibold text-[#B45309] text-xs uppercase tracking-[0.18em]">
						BuyNSellem · Resale
					</p>
					<h1 className="mt-2 font-bold text-2xl text-[#0F172A]">
						{t("finance.title")}
					</h1>
					<p className="mt-1 max-w-2xl text-[#64748B] text-sm">
						{t("finance.description")}
					</p>
				</div>
				<Link
					href="/seller/resale/purchase-orders"
					className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-[#334155] text-sm hover:border-[#F59E0B]"
				>
					<ArrowLeftRight aria-hidden="true" className="h-4 w-4" />
					{t("purchaseOrders")}
				</Link>
			</header>

			{query.isPending && <LoadingRows />}
			{query.isError && (
				<LoadError
					title={t("loadError")}
					onRetry={() => void query.refetch()}
				/>
			)}
			{data && (
				<div className="space-y-6" aria-busy={query.isFetching}>
					{data.accountRequired && (
						<div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
							<CreditCard
								aria-hidden="true"
								className="mt-0.5 h-5 w-5 shrink-0"
							/>
							<div>
								<p className="text-sm">{t("finance.accountRequired")}</p>
								<Link
									href="/seller/payments/setup"
									className="mt-2 inline-flex min-h-11 items-center font-semibold text-sm underline underline-offset-4"
								>
									{t("finance.setupPayout")}
								</Link>
							</div>
						</div>
					)}
					<SummaryCards
						commissionTotal={data.commissions
							.filter((commission) => commission.status === "payable")
							.reduce((total, commission) => total + commission.amount, 0)}
						chargeTotal={data.charges
							.filter(
								(charge) =>
									charge.status === "open" || charge.status === "overdue",
							)
							.reduce((total, charge) => total + charge.amount, 0)}
						locale={locale}
						t={t}
					/>
					<FinanceSection title={t("finance.commissions")}>
						{data.commissions.length ? (
							data.commissions.map((commission) => (
								<FinanceRow
									key={commission.id}
									label={`${t(`finance.commissionStatus.${commission.status}`)} · ${commission.purchaseOrder}`}
									amount={commission.amount}
									locale={locale}
								/>
							))
						) : (
							<p className="px-4 py-5 text-[#64748B] text-sm">
								{t("finance.empty")}
							</p>
						)}
					</FinanceSection>
					<FinanceSection title={t("finance.charges")}>
						{data.charges.length ? (
							data.charges.map((charge) => (
								<FinanceRow
									key={charge.id}
									label={`${t(`finance.chargeStatus.${charge.status}`)}${charge.purchaseOrder ? ` · ${charge.purchaseOrder}` : ""}`}
									amount={charge.amount}
									locale={locale}
								/>
							))
						) : (
							<p className="px-4 py-5 text-[#64748B] text-sm">
								{t("finance.empty")}
							</p>
						)}
					</FinanceSection>
					<FinanceSection title={t("finance.payouts")}>
						{data.payouts.length ? (
							data.payouts.map((payout) => (
								<FinanceRow
									key={payout.id}
									label={`${t(`finance.payoutStatus.${payout.status}`)} · ${payout.reference}`}
									amount={payout.amount}
									locale={locale}
								/>
							))
						) : (
							<p className="px-4 py-5 text-[#64748B] text-sm">
								{t("finance.empty")}
							</p>
						)}
					</FinanceSection>
				</div>
			)}
		</section>
	);
}

function SummaryCards({
	commissionTotal,
	chargeTotal,
	locale,
	t,
}: {
	commissionTotal: number;
	chargeTotal: number;
	locale: "fr" | "en";
	t: ReturnType<typeof useTranslations<"SellerResale">>;
}) {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			<SummaryCard
				title={t("finance.available")}
				amount={commissionTotal}
				locale={locale}
			/>
			<SummaryCard
				title={t("finance.dueCharges")}
				amount={chargeTotal}
				locale={locale}
			/>
		</div>
	);
}

function SummaryCard({
	title,
	amount,
	locale,
}: {
	title: string;
	amount: number;
	locale: "fr" | "en";
}) {
	return (
		<div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
			<p className="text-[#64748B] text-sm">{title}</p>
			<p className="mt-2 font-bold text-2xl text-[#0F172A]">
				{formatXaf(amount, locale)}
			</p>
		</div>
	);
}

function FinanceSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
			<h2 className="border-[#E2E8F0] border-b px-4 py-3 font-semibold text-[#0F172A]">
				{title}
			</h2>
			<div className="divide-y divide-[#F1F5F9]">{children}</div>
		</section>
	);
}

function FinanceRow({
	label,
	amount,
	locale,
}: {
	label: string;
	amount: number;
	locale: "fr" | "en";
}) {
	return (
		<div className="flex min-h-14 items-center justify-between gap-4 px-4 py-3">
			<p className="min-w-0 truncate text-[#475569] text-sm">{label}</p>
			<p className="shrink-0 font-semibold text-[#0F172A] text-sm">
				{formatXaf(amount, locale)}
			</p>
		</div>
	);
}
