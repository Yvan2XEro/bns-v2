import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CatalogueStockCell } from "~/components/seller/catalogue-stock-cell";
import { StatusChip } from "~/components/shop/status-chip";
import { formatXafRange } from "~/lib/money";
import type { CatalogueRow } from "~/types";

function SubTitle({ row }: { row: CatalogueRow }) {
	const t = useTranslations("Catalogue");
	if (row.variantCount === 0) return <>{t("noVariants")}</>;
	if (row.variantCount > 1)
		return <>{t("variantsCount", { count: row.variantCount })}</>;
	return <>{row.sku ?? t("noSku")}</>;
}

function ListingNote({ row }: { row: CatalogueRow }) {
	const t = useTranslations("Catalogue");
	if (row.listingId && row.listingStatus === "published") {
		return (
			<Link
				href={`/listing/${row.listingId}`}
				className="inline-flex items-center gap-1 text-[#1E40AF] text-xs hover:underline"
			>
				<ExternalLink aria-hidden="true" className="h-3 w-3" />
				{t("viewListing")}
			</Link>
		);
	}
	if (row.listingStatus === "rejected") {
		return (
			<span className="text-[#991b1b] text-xs">{t("listingRejected")}</span>
		);
	}
	if (row.listingStatus === "pending") {
		return (
			<span className="text-[#92400e] text-xs">{t("listingPending")}</span>
		);
	}
	return null;
}

export function CatalogueTable({ rows }: { rows: CatalogueRow[] }) {
	const t = useTranslations("Catalogue");

	return (
		<div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
			<table className="w-full min-w-[720px] text-sm">
				<caption className="sr-only">{t("title")}</caption>
				<thead className="border-[#E2E8F0] border-b bg-[#F8FAFC] text-left text-[#64748B] text-xs uppercase">
					<tr>
						<th scope="col" className="px-4 py-3 font-semibold">
							{t("colProduct")}
						</th>
						<th scope="col" className="px-4 py-3 font-semibold">
							{t("colPrice")}
						</th>
						<th scope="col" className="px-4 py-3 font-semibold">
							{t("colStock")}
						</th>
						<th scope="col" className="px-4 py-3 font-semibold">
							{t("colStatus")}
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr
							key={row.id}
							className="border-[#F1F5F9] border-b last:border-0 hover:bg-[#F8FAFC]"
						>
							<td className="px-4 py-3">
								<Link
									href={`/seller/catalogue/${row.id}`}
									className="flex items-center gap-3"
								>
									<div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[#F1F5F9]">
										{row.image?.url && (
											// biome-ignore lint/performance/noImgElement: thumbnails come from arbitrary storage hosts
											<img
												src={row.image.thumbnailURL ?? row.image.url}
												alt=""
												className="h-full w-full object-cover"
											/>
										)}
									</div>
									<div className="min-w-0">
										<p className="truncate font-semibold text-[#0F172A]">
											{row.title}
										</p>
										<p className="text-[#94A3B8] text-xs">
											<SubTitle row={row} />
										</p>
									</div>
								</Link>
							</td>
							<td className="whitespace-nowrap px-4 py-3 text-[#0F172A] tabular-nums">
								{formatXafRange(row.priceMin, row.priceMax)}
							</td>
							<td className="px-4 py-3">
								<CatalogueStockCell row={row} />
							</td>
							<td className="px-4 py-3">
								<div className="flex flex-wrap items-center gap-2">
									<StatusChip kind={row.status} />
									<ListingNote row={row} />
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
