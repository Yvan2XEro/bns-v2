"use client";

import { ClipboardList, PackagePlus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { StockAdjust } from "~/components/seller/stock-adjust-drawer";
import { StockSummaryCards } from "~/components/seller/stock-summary-cards";
import { useCatalogueStockT } from "~/hooks/use-catalogue-stock-t";
import { useStockSummary } from "~/hooks/use-stock";
import { useStockCountOverview } from "~/hooks/use-stock-count-session";
import type { MovementFormState } from "~/lib/stock";
import { cn } from "~/lib/utils";

/** The stock's two tabs, a path each. */
const TABS = [
	{ key: "levels", href: "/seller/stock" },
	{ key: "movements", href: "/seller/stock/movements" },
] as const;

/**
 * What both stock tabs share: the title and when the stock was last counted,
 * the actions (count, adjust, receive), the counters and the tabs. Recording
 * a movement opens the adjust sheet over the page.
 */
export function StockHeader({
	shopId,
	canSeeCosts,
}: {
	shopId: string;
	canSeeCosts: boolean;
}) {
	const t = useTranslations("Stock");
	const ts = useCatalogueStockT("stock");
	const locale = useLocale();
	const pathname = usePathname();
	// The summary exposes the purchase cost, so it is asked for only when the
	// member may see it; the API refuses it to staff either way.
	const summary = useStockSummary(shopId, canSeeCosts);
	const overview = useStockCountOverview(shopId);

	const lastCount = overview.data?.lastCompletedAt;
	const alerts = summary.data
		? summary.data.lowStock.length + summary.data.outOfStock.length
		: null;
	const subtitle = [
		lastCount
			? ts("lastCount", {
					date: new Date(lastCount).toLocaleDateString(locale, {
						day: "numeric",
						month: "long",
					}),
				})
			: overview.data
				? ts("neverCounted")
				: null,
		alerts === null ? null : ts("alerts", { count: alerts }),
	]
		.filter(Boolean)
		.join(" · ");

	const receiptPreset: Partial<MovementFormState> = {
		type: "receipt",
		note: ts("receiptNote", {
			date: new Date().toLocaleDateString(locale, {
				day: "numeric",
				month: "long",
			}),
		}),
	};

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="font-bold text-2xl text-ink">{t("title")}</h1>
					{subtitle && <p className="text-ink-muted text-sm">{subtitle}</p>}
				</div>
				<div className="flex flex-wrap gap-2">
					<Link
						href="/seller/stock/inventory"
						className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-semibold text-ink text-sm hover:border-[var(--shop-accent-border,var(--c-brand-line))]"
					>
						<ClipboardList aria-hidden="true" className="h-4 w-4" />
						{t("startInventory")}
					</Link>
					<button
						type="button"
						onClick={() => void StockAdjust.call({})}
						className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-semibold text-ink text-sm hover:border-[var(--shop-accent-border,var(--c-brand-line))]"
					>
						<SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
						{t("adjustTitle")}
					</button>
					<button
						type="button"
						onClick={() => void StockAdjust.call({ defaults: receiptPreset })}
						className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--shop-accent,var(--c-brand-fill))] px-4 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
					>
						<PackagePlus aria-hidden="true" className="h-4 w-4" />
						{ts("recordReceipt")}
					</button>
				</div>
			</div>

			{summary.data && <StockSummaryCards summary={summary.data} />}

			<nav
				aria-label={t("title")}
				className="-mx-1 flex gap-1 overflow-x-auto border-line border-b px-1"
			>
				{TABS.map((tab) => (
					<Link
						key={tab.key}
						href={tab.href}
						scroll={false}
						aria-current={pathname === tab.href ? "page" : undefined}
						className={cn(
							"-mb-px inline-flex h-11 shrink-0 items-center border-b-2 px-3 font-medium text-sm",
							pathname === tab.href
								? "border-[var(--shop-accent,var(--c-brand))] text-ink"
								: "border-transparent text-ink-muted hover:text-ink",
						)}
					>
						{t(`tabs.${tab.key}`)}
					</Link>
				))}
			</nav>
		</div>
	);
}
