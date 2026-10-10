"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "~/components/empty-state";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useBuyerReturns } from "~/hooks/use-returns";
import {
	RETURN_BASIS_LABELS,
	RETURN_CASE_STATUS_LABELS,
} from "~/lib/case-status";

export function ReturnsClient() {
	const t = useTranslations("Returns");
	const query = useBuyerReturns();

	return (
		<main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
			<header className="flex items-start gap-4">
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#1E40AF]">
					<RotateCcw aria-hidden="true" className="h-5 w-5" />
				</div>
				<div>
					<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
					<p className="mt-1 text-[#64748B] text-sm">{t("subtitle")}</p>
				</div>
			</header>

			{query.isPending && <LoadingRows />}
			{query.isError && (
				<LoadError
					title={t("loadError")}
					onRetry={() => void query.refetch()}
				/>
			)}
			{query.data && query.data.rows.length === 0 && (
				<div className="rounded-2xl border border-[#CBD5E1] border-dashed bg-white">
					<EmptyState
						illustration="empty"
						title={t("emptyTitle")}
						subtitle={t("emptyBody")}
						ctaLabel={t("viewPurchases")}
						ctaHref="/purchases"
					/>
				</div>
			)}
			{query.data && query.data.rows.length > 0 && (
				<section
					aria-busy={query.isFetching}
					aria-label={t("title")}
					className="space-y-3"
				>
					<p className="text-[#64748B] text-sm">
						{t("awaitingCount", { count: query.data.awaitingCount })}
					</p>
					<ul className="space-y-3">
						{query.data.rows.map((row) => (
							<li key={row.id}>
								<Link
									href={`/returns/${encodeURIComponent(row.id)}`}
									className="group flex min-h-20 items-center justify-between gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 transition-colors hover:border-[#93C5FD] hover:bg-[#F8FAFC]"
								>
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-semibold text-[#0F172A]">
												{row.number}
											</span>
											<span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[#475569] text-xs">
												{t(RETURN_CASE_STATUS_LABELS[row.status])}
											</span>
											{row.overdue && (
												<span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700 text-xs">
													{t("overdue")}
												</span>
											)}
										</div>
										<p className="mt-1 truncate text-[#64748B] text-sm">
											{t("orderNumber", { number: row.orderNumber })} ·{" "}
											{t(RETURN_BASIS_LABELS[row.basis])}
										</p>
									</div>
									<div className="flex shrink-0 items-center gap-3">
										<span className="hidden text-right text-[#475569] text-sm sm:block">
											{t("refundAmount", {
												amount: row.refundAmount.toLocaleString(),
											})}
										</span>
										<ArrowRight
											aria-label={t("viewCase")}
											className="h-4 w-4 text-[#64748B] transition-transform group-hover:translate-x-0.5"
										/>
									</div>
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}
		</main>
	);
}
