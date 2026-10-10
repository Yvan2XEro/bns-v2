"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState } from "~/components/empty-state";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useSellerReturns } from "~/hooks/use-returns";
import {
	RETURN_BASIS_LABELS,
	RETURN_CASE_STATUS_LABELS,
} from "~/lib/case-status";

export function SellerReturnsClient({ shopId }: { shopId: string }) {
	const t = useTranslations("Returns");
	const locale = useLocale();
	const query = useSellerReturns(shopId);
	return (
		<main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
			<header className="flex items-start gap-4">
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#1E40AF]">
					<RotateCcw aria-hidden="true" className="h-5 w-5" />
				</div>
				<div>
					<h1 className="font-bold text-2xl text-[#0F172A]">
						{t("sellerTitle")}
					</h1>
					<p className="mt-1 text-[#64748B] text-sm">{t("sellerSubtitle")}</p>
				</div>
			</header>
			{query.isPending ? <LoadingRows /> : null}
			{query.isError ? (
				<LoadError
					title={t("loadError")}
					onRetry={() => void query.refetch()}
				/>
			) : null}
			{query.data?.rows.length === 0 ? (
				<section className="rounded-2xl border border-[#CBD5E1] border-dashed bg-white">
					<EmptyState
						illustration="empty"
						title={t("sellerEmptyTitle")}
						subtitle={t("sellerEmptyBody")}
					/>
				</section>
			) : null}
			{query.data?.rows.length ? (
				<section aria-busy={query.isFetching} className="space-y-3">
					<p className="text-[#64748B] text-sm">
						{t("awaitingCount", { count: query.data.awaitingCount })}
					</p>
					<ul className="space-y-3">
						{query.data.rows.map((row) => (
							<li key={row.id}>
								{/* Spec §1 (SPLIT): a seller row stays inside the workspace. */}
								<Link
									href={`/seller/returns/${encodeURIComponent(row.id)}`}
									className="group flex min-h-20 items-center justify-between gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 hover:border-[#93C5FD] hover:bg-[#F8FAFC]"
								>
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-semibold text-[#0F172A]">
												{row.number}
											</span>
											<span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[#475569] text-xs">
												{t(RETURN_CASE_STATUS_LABELS[row.status])}
											</span>
											{row.overdue ? (
												<span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700 text-xs">
													{t("overdue")}
												</span>
											) : null}
										</div>
										<p className="mt-1 truncate text-[#64748B] text-sm">
											{t("orderNumber", { number: row.orderNumber })} ·{" "}
											{t(RETURN_BASIS_LABELS[row.basis])}
										</p>
										{row.nextDeadline ? (
											<p className="mt-1 text-[#64748B] text-xs">
												{t("nextDeadline", {
													date: new Intl.DateTimeFormat(locale, {
														dateStyle: "medium",
														timeStyle: "short",
													}).format(new Date(row.nextDeadline)),
												})}
											</p>
										) : null}
									</div>
									<div className="flex shrink-0 items-center gap-3">
										<span className="hidden text-right text-[#475569] text-sm sm:block">
											{row.refundAmount.toLocaleString(locale)} XAF
										</span>
										<ArrowRight
											aria-hidden="true"
											className="h-4 w-4 text-[#64748B] transition-transform group-hover:translate-x-0.5"
										/>
									</div>
								</Link>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</main>
	);
}
