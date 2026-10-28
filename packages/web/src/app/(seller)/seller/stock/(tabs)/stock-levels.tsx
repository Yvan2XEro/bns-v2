"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { StockAdjust } from "~/components/seller/stock-adjust-drawer";
import { StatusChip } from "~/components/shop/status-chip";
import { Button } from "~/components/ui/button";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import { useShopVariants } from "~/hooks/use-stock";
import { productTabHref } from "~/lib/product-tabs";
import {
	countStockStates,
	filterStockLevels,
	STOCK_STATE_FILTERS,
	type StockStateFilter,
	stockLevelsFiltersOf,
	toStockLevelRow,
} from "~/lib/stock-levels";
import { cn } from "~/lib/utils";

const PAGE_SIZE = 50;

/**
 * The shop's real stock, one line per variant: what buyers can still order,
 * what orders hold, what is on the shelf, and the state that follows —
 * out of stock and low first. Search and state live in the URL (`?q=`,
 * `?state=`, `?page=`); "Adjust" opens the sheet in place, and
 * `?adjust=<variant>` opens it on that variant.
 */
export function StockLevels({
	shopId,
	adjustVariantId,
}: {
	shopId: string;
	adjustVariantId: string | null;
}) {
	const t = useTranslations("StockLevels");
	const tStock = useTranslations("Stock");
	const locale = useLocale();
	const router = useRouter();
	const pathname = usePathname();
	const search = useSearchParams();
	const filters = stockLevelsFiltersOf(search);
	const page = Math.max(1, Number.parseInt(search.get("page") ?? "1", 10) || 1);
	const variants = useShopVariants(shopId);

	const go = (patch: {
		q?: string;
		state?: StockStateFilter;
		page?: number;
	}) => {
		const next = new URLSearchParams();
		const q = patch.q ?? filters.q;
		const state = patch.state ?? filters.state;
		const nextPage = patch.page ?? 1;
		if (q.trim()) next.set("q", q.trim());
		if (state !== "all") next.set("state", state);
		if (nextPage > 1) next.set("page", String(nextPage));
		const query = next.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	};

	// The search box follows the URL, written back once typing pauses.
	const [typed, setTyped] = useState(filters.q);
	const debounced = useDebouncedValue(typed, 250);
	const goRef = useRef(go);
	goRef.current = go;
	useEffect(() => {
		if (debounced.trim() !== filters.q.trim()) goRef.current({ q: debounced });
	}, [debounced, filters.q]);

	// `?adjust=` opens the sheet once, then leaves the URL.
	const deepLinked = useRef(false);
	useEffect(() => {
		if (!adjustVariantId || deepLinked.current) return;
		deepLinked.current = true;
		goRef.current({ page });
		setTimeout(() => void StockAdjust.call({ variantId: adjustVariantId }), 0);
	}, [adjustVariantId, page]);

	const rows = useMemo(
		() =>
			(variants.data?.docs ?? []).map((variant) =>
				toStockLevelRow(variant, tStock("defaultVariant")),
			),
		[variants.data, tStock],
	);
	const counts = useMemo(() => countStockStates(rows), [rows]);
	const shown = useMemo(
		() => filterStockLevels(rows, filters),
		[rows, filters],
	);
	const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
	const visible = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
	const number = (value: number) => value.toLocaleString(locale);

	return (
		<section className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				<div className="relative min-w-56 flex-1 sm:max-w-sm">
					<Search
						aria-hidden="true"
						className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-ink-faint"
					/>
					<input
						type="search"
						value={typed}
						onChange={(event) => setTyped(event.target.value)}
						placeholder={t("search")}
						aria-label={t("search")}
						className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-[var(--shop-accent-border,var(--c-brand-line))]"
					/>
				</div>
				<div className="flex flex-wrap gap-2">
					{STOCK_STATE_FILTERS.map((state) => (
						<button
							key={state}
							type="button"
							aria-pressed={filters.state === state}
							onClick={() => go({ state })}
							className={cn(
								"inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-medium text-sm",
								filters.state === state
									? "border-ink bg-night font-semibold text-white"
									: "border-line bg-surface text-ink-soft hover:border-[var(--shop-accent-border,var(--c-brand-line))]",
							)}
						>
							{t(`state.${state}`)}
							<span className="tabular-nums opacity-70">
								{number(counts[state])}
							</span>
						</button>
					))}
				</div>
			</div>

			{variants.isPending && <LoadingRows />}
			{variants.isError && (
				<LoadError
					title={tStock("errorTitle")}
					onRetry={() => void variants.refetch()}
				/>
			)}
			{variants.data &&
				(shown.length === 0 ? (
					<p className="rounded-xl border border-line bg-surface p-8 text-center text-ink-muted text-sm">
						{rows.length === 0 ? t("empty") : t("noMatch")}
					</p>
				) : (
					<div className="space-y-3">
						<div className="overflow-x-auto rounded-xl border border-line bg-surface">
							<table className="w-full min-w-[760px] text-sm">
								<thead className="border-line border-b bg-canvas text-left text-ink-muted text-xs uppercase">
									<tr>
										<th className="px-4 py-3 font-semibold">
											{t("colProduct")}
										</th>
										<th className="px-4 py-3 text-right font-semibold">
											{t("colAvailable")}
										</th>
										<th className="px-4 py-3 text-right font-semibold">
											{t("colReserved")}
										</th>
										<th className="px-4 py-3 text-right font-semibold">
											{t("colOnHand")}
										</th>
										<th className="px-4 py-3 text-right font-semibold">
											{t("colThreshold")}
										</th>
										<th className="px-4 py-3 font-semibold">{t("colState")}</th>
										<th className="px-4 py-3">
											<span className="sr-only">{t("colActions")}</span>
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-line">
									{visible.map((row) => (
										<tr key={row.variantId} className="hover:bg-canvas">
											<td className="px-4 py-3">
												<Link
													href={productTabHref(row.productId, "stock")}
													className="font-medium text-ink hover:underline"
												>
													{row.productTitle}
												</Link>
												<p className="text-ink-muted text-xs">
													{[row.label, row.sku].filter(Boolean).join(" · ")}
												</p>
											</td>
											{row.state === "untracked" ? (
												<td
													colSpan={4}
													className="px-4 py-3 text-right text-ink-faint text-xs"
												>
													{t("untracked")}
												</td>
											) : (
												<>
													<td className="px-4 py-3 text-right font-bold text-ink tabular-nums">
														{number(row.available)}
													</td>
													<td className="px-4 py-3 text-right text-ink-muted tabular-nums">
														{number(row.reserved)}
													</td>
													<td className="px-4 py-3 text-right text-ink-muted tabular-nums">
														{number(row.onHand)}
													</td>
													<td className="px-4 py-3 text-right text-ink-muted tabular-nums">
														{row.threshold === null
															? "—"
															: number(row.threshold)}
													</td>
												</>
											)}
											<td className="px-4 py-3">
												{row.state === "out" || row.state === "low" ? (
													<StatusChip kind={row.state} />
												) : row.state === "ok" ? (
													<span className="text-ok-ink text-xs">
														{t("inStock")}
													</span>
												) : null}
											</td>
											<td className="px-4 py-2 text-right">
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() =>
														void StockAdjust.call({ variantId: row.variantId })
													}
													className="text-[var(--shop-accent-text,var(--c-brand))]"
												>
													{t("adjust")}
												</Button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						{pages > 1 && (
							<div className="flex items-center justify-end gap-2 text-sm">
								<span className="text-ink-muted">
									{t("pageOf", { page, pages })}
								</span>
								<button
									type="button"
									disabled={page <= 1}
									onClick={() => go({ page: page - 1 })}
									className="h-9 rounded-lg border border-line bg-surface px-3 disabled:opacity-40"
								>
									{tStock("previous")}
								</button>
								<button
									type="button"
									disabled={page >= pages}
									onClick={() => go({ page: page + 1 })}
									className="h-9 rounded-lg border border-line bg-surface px-3 disabled:opacity-40"
								>
									{tStock("next")}
								</button>
							</div>
						)}
					</div>
				))}
		</section>
	);
}
