import { useTranslations } from "next-intl";
import { StatusChip } from "~/components/shop/status-chip";
import type { CatalogueRow } from "~/types";

/**
 * Three different numbers live behind "stock": what is on the shelf
 * (`stockOnHand`), what an order already holds (the difference) and what is
 * still sellable (`available`). The sellable figure leads, because that is
 * what the shop can promise a buyer.
 */
export function CatalogueStockCell({ row }: { row: CatalogueRow }) {
	const t = useTranslations("Catalogue");

	if (row.variantCount === 0) {
		return <span className="text-[#94A3B8] text-xs">{t("noVariants")}</span>;
	}
	if (!row.trackInventory) {
		return <span className="text-[#94A3B8] text-xs">{t("notTracked")}</span>;
	}

	const reserved = Math.max(0, row.stockOnHand - row.available);

	return (
		<div className="flex flex-col gap-0.5">
			<div className="flex items-center gap-2">
				<span className="font-bold text-[#0F172A] tabular-nums">
					{row.available}
				</span>
				<span className="text-[#64748B] text-xs">
					{t("availableUnit", { count: row.available })}
				</span>
				{row.outOfStock ? (
					<StatusChip kind="out" />
				) : row.lowStock ? (
					<StatusChip kind="low" />
				) : null}
			</div>
			{reserved > 0 && (
				<span className="text-[#94A3B8] text-xs">
					{t("reservedCount", { count: reserved })}
				</span>
			)}
		</div>
	);
}
