"use client";

import { AlertTriangle, ArrowRight, ImageIcon, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useOrderMoney } from "~/hooks/use-order-money";
import {
	useResaleLinks,
	useResellerFinance,
	useResoldListings,
	useUpdateResaleListingPrices,
} from "~/hooks/use-resale";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate } from "~/lib/order-money";
import {
	pricesAtMinimum,
	type ResoldFilter,
	resaleDuration,
	resaleEarnings,
	resaleGain,
	resaleHref,
	resoldCounts,
	resoldFilterOf,
	shortDayMonth,
} from "~/lib/resale-hub";
import { cn } from "~/lib/utils";
import type {
	ResoldListing,
	ResoldListingStatus,
} from "../../../../../../../api/src/contracts/resale";
import { initials } from "../catalogue/resale-catalogue-client";

const PAGE_SIZE = 10;
const FILTERS: ResoldFilter[] = ["all", "on_sale", "hidden", "out_of_stock"];
const STATUS_TONE: Record<ResoldListingStatus, string> = {
	on_sale: "bg-ok-soft text-ok-ink",
	below_minimum: "bg-bad-soft text-bad-ink",
	out_of_stock: "bg-warn-soft text-warn-ink",
	unavailable: "bg-warn-soft text-warn-ink",
	held: "bg-subtle text-ink-soft",
	draft: "bg-subtle text-ink-soft",
};

export function ResoldTab({ shopId }: { shopId: string }) {
	const t = useTranslations("SellerResaleHub");
	const tRoot = useTranslations();
	const locale = useLocale().startsWith("fr") ? "fr" : "en";
	const formatOrderMoney = useOrderMoney();
	const query = useResoldListings(shopId);
	const update = useUpdateResaleListingPrices(shopId);
	const [filter, setFilter] = useState<ResoldFilter>("all");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(0);
	const listings = query.data?.listings ?? [];
	const counts = resoldCounts(listings);
	const term = search.trim().toLocaleLowerCase();
	const visible = listings.filter(
		(listing) =>
			(filter === "all" || resoldFilterOf(listing) === filter) &&
			(!term || listing.title.toLocaleLowerCase().includes(term)),
	);
	const rows = visible.flatMap((listing) =>
		listing.variants.map((variant) => ({ listing, variant })),
	);
	const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
	const current = Math.min(page, pageCount - 1);
	const pageRows = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
	const belowMinimum = listings.filter(
		(listing) => listing.status === "below_minimum",
	);
	const rateBps = query.data?.commissionRateBps ?? 0;
	const updateError = update.error
		? resolveErrorMessage(update.error, tRoot, t("actionFailed"))
		: null;

	return (
		<div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_300px]">
			<div className="min-w-0 space-y-3.5">
				<div className="flex flex-wrap items-center gap-2.5">
					<div className="flex flex-wrap gap-2">
						{FILTERS.map((option) => (
							<button
								key={option}
								type="button"
								aria-pressed={filter === option}
								onClick={() => {
									setFilter(option);
									setPage(0);
								}}
								className={cn(
									"inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px]",
									filter === option
										? "border-ink bg-night font-semibold text-white"
										: "border-line bg-surface font-medium text-ink-soft",
								)}
							>
								{t(`filter_${option}`)}
								<span
									className={cn(
										"font-bold text-[11px]",
										filter === option ? "text-ink-ghost" : "text-ink-muted",
									)}
								>
									{counts[option]}
								</span>
							</button>
						))}
					</div>
					<label className="relative ml-auto block w-full sm:w-[260px]">
						<span className="sr-only">{t("searchProduct")}</span>
						<Search
							aria-hidden="true"
							className="absolute top-3 left-3 h-4 w-4 text-ink-faint"
						/>
						<input
							type="search"
							value={search}
							maxLength={120}
							onChange={(event) => {
								setSearch(event.target.value);
								setPage(0);
							}}
							placeholder={t("searchProduct")}
							className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-[var(--shop-accent,var(--c-brand))] focus:ring-2 focus:ring-[var(--shop-accent-border,var(--c-brand-tint))]"
						/>
					</label>
				</div>

				{updateError ? (
					<p
						role="alert"
						className="rounded-lg bg-red-50 p-3 text-red-800 text-sm"
					>
						{updateError}
					</p>
				) : null}
				{belowMinimum.map((listing) => (
					<BelowMinimumBanner
						key={listing.listingId}
						listing={listing}
						pending={update.isPending}
						onFix={() =>
							update.mutate({
								listingId: listing.listingId,
								prices: pricesAtMinimum(listing),
							})
						}
					/>
				))}

				{query.isPending ? <LoadingRows /> : null}
				{query.isError ? (
					<LoadError
						title={t("resoldLoadError")}
						onRetry={() => void query.refetch()}
					/>
				) : null}
				{query.data && rows.length === 0 ? (
					<div className="rounded-xl border border-line-strong border-dashed bg-surface px-6 py-14 text-center">
						<p className="font-medium text-ink-mid">
							{listings.length === 0 ? t("resoldEmpty") : t("resoldNoMatch")}
						</p>
						{listings.length === 0 ? (
							<Link
								href={resaleHref("reseller", "find")}
								className="mt-3 inline-flex items-center gap-1.5 font-semibold text-[var(--shop-accent-text,var(--c-brand))] text-sm"
							>
								{t("tabFind")}
								<ArrowRight aria-hidden="true" className="h-4 w-4" />
							</Link>
						) : null}
					</div>
				) : null}
				{rows.length > 0 ? (
					<div className="overflow-hidden rounded-xl border border-line bg-surface">
						<div className="overflow-x-auto">
							<table className="w-full min-w-[760px] border-collapse text-left">
								<thead>
									<tr className="border-line border-b bg-canvas text-ink-muted text-xs uppercase tracking-[0.4px]">
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colProduct")}
										</th>
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colSupplier")}
										</th>
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colSupplierPrice")}
										</th>
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colYourPrice")}
										</th>
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colMargin")}
										</th>
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colSupplierStock")}
										</th>
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colStatus")}
										</th>
									</tr>
								</thead>
								<tbody>
									{pageRows.map(({ listing, variant }) => {
										const below =
											variant.minRetailPrice !== null &&
											variant.price < variant.minRetailPrice;
										const gain =
											variant.supplierPrice !== null
												? resaleGain(
														variant.price,
														variant.supplierPrice,
														rateBps,
													)
												: null;
										return (
											<tr
												key={`${listing.listingId}:${variant.id}`}
												className={cn(
													"border-subtle border-b text-ink-soft text-sm tabular-nums",
													listing.status === "below_minimum" && "bg-bad-faint",
												)}
											>
												<td className="px-3.5 py-2.5">
													<div className="flex items-center gap-2.5">
														<span className="relative flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-subtle text-ink-mid">
															{listing.imageUrl ? (
																<Image
																	src={listing.imageUrl}
																	alt=""
																	fill
																	sizes="38px"
																	className="object-cover"
																/>
															) : (
																<ImageIcon
																	aria-hidden="true"
																	className="h-5 w-5"
																/>
															)}
														</span>
														<span className="flex min-w-0 flex-col">
															<span className="font-semibold text-ink">
																{listing.title}
																{listing.variants.length > 1 && variant.label
																	? ` · ${variant.label}`
																	: ""}
															</span>
															<span className="text-ink-muted text-xs">
																{variant.minRetailPriceChangedAt
																	? t("minShortSince", {
																			amount: formatOrderMoney(
																				variant.minRetailPrice,
																			),
																			date: shortDayMonth(
																				variant.minRetailPriceChangedAt,
																				locale,
																			),
																		})
																	: t("minShort", {
																			amount: formatOrderMoney(
																				variant.minRetailPrice,
																			),
																		})}
															</span>
														</span>
													</div>
												</td>
												<td className="px-3.5 py-2.5">
													<span className="flex items-center gap-1.5">
														<span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[#134E4A] font-extrabold text-[#99F6E4] text-[9px]">
															{initials(listing.supplier.name)}
														</span>
														<span className="whitespace-nowrap text-[13px]">
															{listing.supplier.name}
														</span>
													</span>
												</td>
												<td className="px-3.5 py-2.5">
													{formatOrderMoney(variant.supplierPrice)}
												</td>
												<td className="px-3.5 py-2.5">
													<span
														className={cn(
															"font-bold",
															below ? "text-bad-ink-soft" : "text-ink",
														)}
													>
														{formatOrderMoney(variant.price)}
													</span>
												</td>
												<td className="px-3.5 py-2.5">
													{gain ? (
														<span className="flex flex-col">
															<span
																className={cn(
																	"whitespace-nowrap font-semibold",
																	below
																		? "text-bad-ink-soft"
																		: "text-ok-ink-soft",
																)}
															>
																+ {formatOrderMoney(gain.margin)}
															</span>
															<span className="whitespace-nowrap text-[11px] text-ink-faint">
																{t("netShort", {
																	amount: formatOrderMoney(gain.gain),
																})}
															</span>
														</span>
													) : (
														"—"
													)}
												</td>
												<td
													className={cn(
														"px-3.5 py-2.5",
														variant.supplierStock === 0 && "text-warn-ink-soft",
													)}
												>
													{variant.supplierStock === null
														? t("stockInStock")
														: variant.supplierStock}
												</td>
												<td className="px-3.5 py-2.5">
													<span
														className={cn(
															"inline-flex rounded-lg px-2.5 py-0.5 font-semibold text-xs leading-[15px]",
															STATUS_TONE[listing.status],
														)}
													>
														{t(`resoldStatus_${listing.status}`)}
													</span>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
						<div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-ink-muted text-sm">
							<span>
								{t("pageRange", {
									from: current * PAGE_SIZE + 1,
									to: current * PAGE_SIZE + pageRows.length,
									total: rows.length,
								})}
							</span>
							<div className="flex gap-1.5">
								<button
									type="button"
									disabled={current === 0}
									onClick={() => setPage(current - 1)}
									className="h-[34px] rounded-lg border border-line bg-surface px-3 font-semibold text-[13px] text-ink disabled:bg-canvas disabled:text-ink-faint"
								>
									{t("previous")}
								</button>
								<button
									type="button"
									disabled={current >= pageCount - 1}
									onClick={() => setPage(current + 1)}
									className="h-[34px] rounded-lg border border-line bg-surface px-3 font-semibold text-[13px] text-ink disabled:bg-canvas disabled:text-ink-faint"
								>
									{t("next")}
								</button>
							</div>
						</div>
					</div>
				) : null}
			</div>
			<aside className="space-y-[18px]">
				<SuppliersCard shopId={shopId} />
				<EarningsCard shopId={shopId} />
			</aside>
		</div>
	);
}

function BelowMinimumBanner({
	listing,
	pending,
	onFix,
}: {
	listing: ResoldListing;
	pending: boolean;
	onFix: () => void;
}) {
	const t = useTranslations("SellerResaleHub");
	const formatOrderMoney = useOrderMoney();
	const offending = listing.variants.find(
		(variant) =>
			variant.minRetailPrice !== null && variant.price < variant.minRetailPrice,
	);
	const target = offending?.minRetailPrice ?? null;
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-bad-line bg-bad-faint px-3.5 py-3">
			<AlertTriangle
				aria-hidden="true"
				className="h-5 w-5 shrink-0 text-bad-ink-soft"
			/>
			<p className="min-w-0 flex-1 text-bad-deep text-sm leading-5">
				<strong>{t("hiddenTitle", { title: listing.title })}</strong>{" "}
				{offending && target !== null
					? t("hiddenBody", {
							supplier: listing.supplier.name,
							minimum: formatOrderMoney(target),
							price: formatOrderMoney(offending.price),
						})
					: t("hiddenBodyGeneric", { supplier: listing.supplier.name })}
			</p>
			<button
				type="button"
				disabled={pending}
				onClick={onFix}
				className="inline-flex h-[34px] items-center whitespace-nowrap rounded-lg bg-[var(--shop-accent,var(--c-brand))] px-3 font-semibold text-[13px] text-[var(--shop-on-accent,#FFFFFF)] disabled:opacity-60"
			>
				{target !== null
					? t("raiseTo", { amount: formatOrderMoney(target) })
					: t("raiseToMinimum")}
			</button>
		</div>
	);
}

function SuppliersCard({ shopId }: { shopId: string }) {
	const t = useTranslations("SellerResaleHub");
	const locale = useLocale().startsWith("fr") ? "fr" : "en";
	const links = useResaleLinks(shopId, "reseller", "all");
	const docs = links.data?.docs ?? [];
	return (
		<section className="rounded-xl border border-line bg-surface">
			<div className="flex items-center justify-between border-subtle border-b px-[18px] py-4">
				<h2 className="font-bold text-base">{t("tabSuppliers")}</h2>
				<span className="rounded-full bg-[#E0E7FF] px-2.5 py-0.5 font-semibold text-[#3730A3] text-xs">
					{links.data?.totalDocs ?? 0}
				</span>
			</div>
			{links.isError ? (
				<p className="px-[18px] py-4 text-ink-muted text-sm">
					{t("suppliersLoadError")}
				</p>
			) : docs.length === 0 && links.data ? (
				<p className="px-[18px] py-4 text-ink-muted text-sm">
					{t("suppliersEmpty")}
				</p>
			) : null}
			{docs.map((link) => (
				<div
					key={link.id}
					className="flex flex-col gap-2.5 border-subtle border-b px-[18px] py-3.5 last:border-b-0"
				>
					<div className="flex items-center gap-2.5">
						<span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#134E4A] font-extrabold text-[#99F6E4] text-[13px]">
							{initials(link.partnerShop.name)}
						</span>
						<span className="flex flex-col gap-0.5">
							<span className="font-semibold text-sm">
								{link.partnerShop.name}
							</span>
							{link.partnerShop.level ? (
								<span className="w-fit rounded-full bg-[var(--shop-accent,var(--c-brand))] px-2 py-0.5 font-semibold text-[11px] text-[var(--shop-on-accent,#FFFFFF)]">
									{t("levelBadge", { level: link.partnerShop.level })}
								</span>
							) : null}
						</span>
					</div>
					<span
						className={cn(
							"w-fit rounded-full px-2.5 py-0.5 font-semibold text-xs",
							link.status === "approved"
								? "bg-ok-soft text-ok-ink"
								: link.status === "requested"
									? "bg-warn-soft text-warn-ink"
									: "bg-bad-soft text-bad-ink",
						)}
					>
						{link.status === "approved" && link.updatedAt
							? t("approvedOn", {
									date: formatOrderDate(link.updatedAt, locale),
								})
							: t(`linkStatus_${link.status}`)}
					</span>
					<dl className="flex flex-col gap-1.5 text-sm">
						{link.status === "requested" ? (
							<KeyValue
								label={t("requestSentOn")}
								value={
									link.requestedAt
										? formatOrderDate(link.requestedAt, locale)
										: "—"
								}
							/>
						) : (
							<>
								<KeyValue
									label={t("resoldProducts")}
									value={String(link.stats.publishedListings)}
								/>
								{link.partnerShop.resaleStats?.medianShipHours != null ? (
									<KeyValue
										label={t("medianShipping")}
										value={durationText(
											t,
											link.partnerShop.resaleStats.medianShipHours,
										)}
									/>
								) : null}
								<KeyValue
									label={t("delivered30d")}
									value={String(link.stats.deliveredOrders30d)}
								/>
							</>
						)}
					</dl>
					{link.status === "requested" &&
					link.partnerShop.resaleStats?.medianResponseHours != null ? (
						<p className="text-ink-muted text-xs">
							{t("usualResponseWithin", {
								duration: durationText(
									t,
									link.partnerShop.resaleStats.medianResponseHours,
								),
							})}
						</p>
					) : null}
					{link.status === "approved" ? (
						<Link
							href={resaleHref("reseller", "find", {
								supplier: link.partnerShop.id,
							})}
							className="inline-flex items-center gap-1 font-semibold text-[13px] text-[var(--shop-accent-text,var(--c-brand))]"
						>
							{t("seeCatalogue")}
							<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
						</Link>
					) : null}
				</div>
			))}
		</section>
	);
}

function EarningsCard({ shopId }: { shopId: string }) {
	const t = useTranslations("SellerResaleHub");
	const formatOrderMoney = useOrderMoney();
	const finance = useResellerFinance(shopId);
	const earnings = finance.data ? resaleEarnings(finance.data) : null;
	return (
		<section className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-[18px] py-4">
			<h2 className="font-bold text-base">{t("earningsTitle")}</h2>
			<dl className="flex flex-col gap-1.5 text-sm">
				<KeyValue
					label={t("earningsPending")}
					value={earnings ? formatOrderMoney(earnings.pending) : "—"}
				/>
				<KeyValue
					label={t("earningsPaidThisMonth")}
					value={earnings ? formatOrderMoney(earnings.paidThisMonth) : "—"}
				/>
			</dl>
			<p className="text-ink-muted text-xs leading-[18px]">
				{t("earningsNote")}
			</p>
			<div className="flex flex-wrap gap-x-4 gap-y-1">
				<Link
					href="/seller/resale/finance"
					className="font-semibold text-[13px] text-[var(--shop-accent-text,var(--c-brand))]"
				>
					{t("earningsDetails")}
				</Link>
				<Link
					href="/seller/resale/purchase-orders?side=reseller"
					className="font-semibold text-[13px] text-[var(--shop-accent-text,var(--c-brand))]"
				>
					{t("myPurchaseOrders")}
				</Link>
			</div>
		</section>
	);
}

function durationText(
	t: ReturnType<typeof useTranslations<"SellerResaleHub">>,
	hours: number,
): string {
	const duration = resaleDuration(hours);
	return duration.kind === "hours"
		? t("durationHours", { hours: duration.hours })
		: t("durationDays", { days: duration.days });
}

function KeyValue({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between gap-2.5">
			<dt className="text-ink-muted">{label}</dt>
			<dd className="text-right font-semibold text-ink tabular-nums">
				{value}
			</dd>
		</div>
	);
}
