"use client";

import { ExternalLink, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CatalogueStockCell } from "~/components/seller/catalogue-stock-cell";
import { StatusChip } from "~/components/shop/status-chip";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useCatalogueStockT } from "~/hooks/use-catalogue-stock-t";
import { useCurrencyCode, useOrderMoney } from "~/hooks/use-order-money";
import { skuSummary } from "~/lib/catalogue";
import { formatOrderMoneyRange } from "~/lib/order-money";
import type { CatalogueRow, ProductStatus } from "~/types";

const isResale = (row: CatalogueRow) => row.provenance === "resale";

function SubTitle({ row }: { row: CatalogueRow }) {
	const t = useTranslations("Catalogue");
	const tc = useCatalogueStockT("catalogue");
	if (isResale(row)) {
		return <>{tc("supplier", { name: row.supplier?.name ?? "" })}</>;
	}
	if (row.variantCount === 0) return <>{t("noVariants")}</>;
	const skus = skuSummary(row.skus ?? (row.sku ? [row.sku] : []));
	if (row.variantCount > 1) {
		const count = t("variantsCount", { count: row.variantCount });
		return <>{skus ? `${count} · ${skus}` : count}</>;
	}
	return <>{skus ?? t("noSku")}</>;
}

function ListingNote({ row }: { row: CatalogueRow }) {
	const t = useTranslations("Catalogue");
	if (row.listingId && row.listingStatus === "published") {
		return (
			<Link
				href={`/listing/${row.listingId}`}
				className="inline-flex items-center gap-1 text-[var(--shop-accent-text,var(--c-brand))] text-xs hover:underline"
			>
				<ExternalLink aria-hidden="true" className="h-3 w-3" />
				{t("viewListing")}
			</Link>
		);
	}
	if (row.listingStatus === "rejected") {
		return <span className="text-bad-ink text-xs">{t("listingRejected")}</span>;
	}
	if (row.listingStatus === "pending") {
		return <span className="text-warn-ink text-xs">{t("listingPending")}</span>;
	}
	return null;
}

function ResaleStockCell({ row }: { row: CatalogueRow }) {
	const tc = useCatalogueStockT("catalogue");
	return (
		<span
			className={
				row.supplierAvailable
					? "text-ink-muted text-xs"
					: "font-semibold text-bad-ink text-xs"
			}
		>
			{tc(row.supplierAvailable ? "atSupplier" : "supplierOut")}
		</span>
	);
}

function RowMenu({
	row,
	canArchive,
	onSetStatus,
}: {
	row: CatalogueRow;
	canArchive: boolean;
	onSetStatus: (ids: string[], status: ProductStatus) => void;
}) {
	const tc = useCatalogueStockT("catalogue");
	const published = row.listingId && row.listingStatus === "published";
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={tc("rowMenu", { title: row.title })}
				className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-subtle"
			>
				<MoreHorizontal aria-hidden="true" className="h-4 w-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{!isResale(row) && (
					<DropdownMenuItem asChild>
						<Link href={`/seller/catalogue/${row.id}`}>{tc("edit")}</Link>
					</DropdownMenuItem>
				)}
				{!isResale(row) && row.singleVariantId && (
					<DropdownMenuItem asChild>
						<Link href={`/seller/stock?adjust=${row.singleVariantId}`}>
							{tc("adjustStock")}
						</Link>
					</DropdownMenuItem>
				)}
				{published && (
					<DropdownMenuItem asChild>
						<Link href={`/listing/${row.listingId}`}>{tc("viewListing")}</Link>
					</DropdownMenuItem>
				)}
				{isResale(row) && (
					<DropdownMenuItem asChild>
						<Link href="/seller/resale/catalogue">{tc("manageResale")}</Link>
					</DropdownMenuItem>
				)}
				{!isResale(row) && (
					<>
						<DropdownMenuSeparator />
						{row.status !== "active" && (
							<DropdownMenuItem
								onSelect={() => onSetStatus([row.id], "active")}
							>
								{tc("bulk.active")}
							</DropdownMenuItem>
						)}
						{row.status !== "draft" && (
							<DropdownMenuItem onSelect={() => onSetStatus([row.id], "draft")}>
								{tc("bulk.draft")}
							</DropdownMenuItem>
						)}
						{canArchive && row.status !== "archived" && (
							<DropdownMenuItem
								onSelect={() => onSetStatus([row.id], "archived")}
								className="text-bad-ink"
							>
								{tc("bulk.archived")}
							</DropdownMenuItem>
						)}
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function CatalogueTable({
	rows,
	selected,
	onToggle,
	onToggleAll,
	canArchive,
	onSetStatus,
	showProvenance,
}: {
	rows: CatalogueRow[];
	selected: ReadonlySet<string>;
	onToggle: (id: string) => void;
	onToggleAll: (ids: string[], select: boolean) => void;
	canArchive: boolean;
	onSetStatus: (ids: string[], status: ProductStatus) => void;
	showProvenance: boolean;
}) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Catalogue");
	const tc = useCatalogueStockT("catalogue");
	const currencyCode = useCurrencyCode();
	// Only the shop's own products take a status; resale rows are managed on
	// the resale screens.
	const selectable = rows.filter((row) => !isResale(row)).map((row) => row.id);
	const allSelected =
		selectable.length > 0 && selectable.every((id) => selected.has(id));

	const hrefOf = (row: CatalogueRow) =>
		isResale(row)
			? row.listingStatus === "published"
				? `/listing/${row.listingId}`
				: "/seller/resale/catalogue"
			: `/seller/catalogue/${row.id}`;

	return (
		<>
			{/* Below md each product is a card: the table's status and menu would
			    otherwise sit off-screen. */}
			<ul className="space-y-3 md:hidden">
				{rows.map((row) => {
					const resale = isResale(row);
					return (
						<li
							key={row.id}
							className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3"
						>
							{!resale && (
								<input
									type="checkbox"
									aria-label={tc("select", { title: row.title })}
									checked={selected.has(row.id)}
									onChange={() => onToggle(row.id)}
									className="mt-3 h-5 w-5 rounded border-line-strong accent-[var(--shop-accent,var(--c-brand))]"
								/>
							)}
							<Link href={hrefOf(row)} className="flex min-w-0 flex-1 gap-3">
								<div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-subtle">
									{row.image?.url && (
										// biome-ignore lint/performance/noImgElement: thumbnails come from arbitrary storage hosts
										<img
											src={row.image.thumbnailURL ?? row.image.url}
											alt=""
											className="h-full w-full object-cover"
										/>
									)}
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate font-semibold text-ink">{row.title}</p>
									<p className="text-ink text-sm tabular-nums">
										{formatOrderMoneyRange(
											formatOrderMoney,
											row.priceMin,
											row.priceMax,
										)}
									</p>
									<div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
										<StatusChip kind={row.status} />
										{resale ? (
											<ResaleStockCell row={row} />
										) : (
											<CatalogueStockCell row={row} />
										)}
									</div>
								</div>
							</Link>
							<RowMenu
								row={row}
								canArchive={canArchive}
								onSetStatus={onSetStatus}
							/>
						</li>
					);
				})}
			</ul>
			<div className="hidden overflow-x-auto rounded-xl border border-line bg-surface md:block">
				<table className="w-full min-w-[880px] text-sm">
					<caption className="sr-only">{t("title")}</caption>
					<thead className="border-line border-b bg-canvas text-left text-ink-muted text-xs uppercase">
						<tr>
							<th scope="col" className="w-9 py-3 pl-4">
								<input
									type="checkbox"
									aria-label={tc("selectAll")}
									checked={allSelected}
									disabled={selectable.length === 0}
									onChange={() => onToggleAll(selectable, !allSelected)}
									className="h-4 w-4 rounded border-line-strong accent-[var(--shop-accent,var(--c-brand))]"
								/>
							</th>
							<th scope="col" className="px-4 py-3 font-semibold">
								{t("colProduct")}
							</th>
							{showProvenance && (
								<th scope="col" className="px-4 py-3 font-semibold">
									{tc("colProvenance")}
								</th>
							)}
							<th scope="col" className="px-4 py-3 font-semibold">
								{t("colPrice", { currency: currencyCode })}
							</th>
							<th scope="col" className="px-4 py-3 font-semibold">
								{t("colStock")}
							</th>
							<th scope="col" className="px-4 py-3 font-semibold">
								{t("colStatus")}
							</th>
							<th scope="col" className="w-10 px-2 py-3">
								<span className="sr-only">{tc("colActions")}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => {
							const resale = isResale(row);
							const href = hrefOf(row);
							return (
								<tr
									key={row.id}
									className="border-subtle border-b last:border-0 hover:bg-canvas"
								>
									<td className="py-3 pl-4">
										{!resale && (
											<input
												type="checkbox"
												aria-label={tc("select", { title: row.title })}
												checked={selected.has(row.id)}
												onChange={() => onToggle(row.id)}
												className="h-4 w-4 rounded border-line-strong accent-[var(--shop-accent,var(--c-brand))]"
											/>
										)}
									</td>
									<td className="px-4 py-3">
										<Link href={href} className="flex items-center gap-3">
											<div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-subtle">
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
												<p className="truncate font-semibold text-ink">
													{row.title}
												</p>
												<p className="truncate text-ink-faint text-xs">
													<SubTitle row={row} />
												</p>
											</div>
										</Link>
									</td>
									{showProvenance && (
										<td className="px-4 py-3">
											{resale ? (
												<span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#EDE9FE] px-2.5 py-0.5 font-semibold text-[#5B21B6] text-xs">
													{tc("provenanceResale")}
												</span>
											) : (
												<span className="whitespace-nowrap text-[13px] text-ink-mid">
													{tc("provenanceOwn")}
												</span>
											)}
										</td>
									)}
									<td className="whitespace-nowrap px-4 py-3 text-ink tabular-nums">
										{formatOrderMoneyRange(
											formatOrderMoney,
											row.priceMin,
											row.priceMax,
										)}
									</td>
									<td className="px-4 py-3">
										{resale ? (
											<ResaleStockCell row={row} />
										) : (
											<CatalogueStockCell row={row} />
										)}
									</td>
									<td className="px-4 py-3">
										<div className="flex flex-wrap items-center gap-2">
											<StatusChip kind={row.status} />
											<ListingNote row={row} />
										</div>
									</td>
									<td className="px-2 py-3">
										<RowMenu
											row={row}
											canArchive={canArchive}
											onSetStatus={onSetStatus}
										/>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</>
	);
}
