"use client";

import { ArrowRight, Scale } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useBuyerDisputes } from "~/hooks/use-disputes";

export function BuyerDisputesClient() {
	const t = useTranslations("Disputes");
	const locale = useLocale();
	const query = useBuyerDisputes();
	return (
		<main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
			<header className="flex items-start gap-4">
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F5F3FF] text-[#6D28D9]">
					<Scale aria-hidden="true" className="h-5 w-5" />
				</div>
				<div>
					<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
					<p className="mt-1 text-[#64748B] text-sm">{t("subtitle")}</p>
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
				<section className="rounded-2xl border border-[#CBD5E1] border-dashed bg-white px-6 py-14 text-center">
					<h2 className="font-semibold text-[#0F172A]">{t("emptyTitle")}</h2>
					<p className="mx-auto mt-2 max-w-md text-[#64748B] text-sm">
						{t("emptyBody")}
					</p>
					<Link
						href="/purchases"
						className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#1E40AF] px-4 font-medium text-sm text-white"
					>
						{t("viewPurchases")}
					</Link>
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
								<Link
									href={`/disputes/${encodeURIComponent(row.id)}`}
									className="group flex min-h-20 items-center justify-between gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 hover:border-[#C4B5FD] hover:bg-[#FAF9FF]"
								>
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-semibold text-[#0F172A]">
												{row.number}
											</span>
											<span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[#475569] text-xs">
												{t(`status.${row.status}`)}
											</span>
											{row.overdue ? (
												<span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700 text-xs">
													{t("overdue")}
												</span>
											) : null}
										</div>
										<p className="mt-1 truncate text-[#64748B] text-sm">
											{t("orderNumber", { number: row.orderNumber })} ·{" "}
											{t(`reason.${row.reason}`)}
										</p>
										{row.nextDeadline ? (
											<p className="mt-1 text-[#64748B] text-xs">
												{t("deadline", {
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
											{row.amountAtStake.toLocaleString(locale)} XAF
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
