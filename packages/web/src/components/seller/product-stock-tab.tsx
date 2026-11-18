"use client";

import { LoaderCircle, PackagePlus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { MovementsTable } from "~/components/seller/movements-table";
import { StockAdjust } from "~/components/seller/stock-adjust-drawer";
import { StatusChip } from "~/components/shop/status-chip";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { NumberInput } from "~/components/ui/number-input";
import { useCatalogueStockT } from "~/hooks/use-catalogue-stock-t";
import { useCurrencyCode } from "~/hooks/use-order-money";
import { useRecordMovement } from "~/hooks/use-record-movement";
import { useMovements } from "~/hooks/use-stock";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type HistoryFilters,
	historyFiltersOf,
	historySearch,
	MOVEMENT_FILTERS,
	type MovementFilter,
	NOTE_MAX,
	receiptLines,
} from "~/lib/stock";
import { cn } from "~/lib/utils";
import { variantLabel } from "~/lib/variants";
import type { VariantDoc } from "~/types";

const PAGE_SIZE = 20;

/**
 * The product's stock, every variant at once: what each can still sell, what
 * orders hold, and an "Adjust" per line that opens the adjust sheet in place.
 * An arrival is entered across the variants in one go. Below, the product's
 * own history, filtered from the URL (`?type=`, `?variant=`, `?page=`).
 *
 * Movements are ledger writes, saved as they are made: they never wait for
 * the product form's "Save".
 */
export function ProductStockTab({
	shopId,
	productId,
	variants,
	showCost,
}: {
	shopId: string;
	productId: string;
	variants: VariantDoc[];
	showCost: boolean;
}) {
	const live = variants.filter((variant) => !variant.archivedAt);

	return (
		<div className="space-y-5">
			<VariantStock shopId={shopId} variants={live} showCost={showCost} />
			<ProductHistory shopId={shopId} productId={productId} variants={live} />
		</div>
	);
}

function VariantStock({
	shopId,
	variants,
	showCost,
}: {
	shopId: string;
	variants: VariantDoc[];
	showCost: boolean;
}) {
	const t = useTranslations("ProductStock");
	const tStock = useTranslations("Stock");
	const tRoot = useTranslations();
	const ts = useCatalogueStockT("stock");
	const locale = useLocale();
	const currencyCode = useCurrencyCode();
	const record = useRecordMovement(shopId);
	const [receiving, setReceiving] = useState(false);
	const [quantities, setQuantities] = useState<Record<string, string>>({});
	const [costs, setCosts] = useState<Record<string, string>>({});
	const [note, setNote] = useState("");
	const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);

	const labelOf = (variant: VariantDoc) =>
		variantLabel(variant.optionValues, tStock("defaultVariant"));
	const { lines } = receiptLines(quantities, costs);
	const units = lines.reduce((sum, line) => sum + line.quantity, 0);

	const startReceiving = () => {
		setQuantities({});
		setCosts({});
		setLineErrors({});
		setNote(
			ts("receiptNote", {
				date: new Date().toLocaleDateString(locale, {
					day: "numeric",
					month: "long",
				}),
			}),
		);
		setReceiving(true);
	};

	// One movement per line: each is its own ledger write, so a refused line
	// is named and kept for another try while the others stand.
	const saveReceipt = async () => {
		const { lines: valid, invalid } = receiptLines(quantities, costs);
		const errors: Record<string, string> = {};
		for (const id of invalid) errors[id] = t("lineInvalid");
		if (invalid.length > 0 || valid.length === 0) {
			setLineErrors(errors);
			return;
		}
		setSaving(true);
		const done: string[] = [];
		for (const line of valid) {
			try {
				await record.mutateAsync({
					variantId: line.variantId,
					input: {
						type: "receipt",
						quantity: line.quantity,
						...(showCost && line.unitCost !== null
							? { unitCost: line.unitCost }
							: {}),
						...(note.trim() ? { note: note.trim() } : {}),
					},
				});
				done.push(line.variantId);
			} catch (error) {
				errors[line.variantId] = resolveErrorMessage(error, tRoot);
			}
		}
		setSaving(false);
		setLineErrors(errors);
		const received = valid
			.filter((line) => done.includes(line.variantId))
			.reduce((sum, line) => sum + line.quantity, 0);
		if (received > 0) toast.success(t("receiptSaved", { units: received }));
		if (done.length === valid.length) {
			setReceiving(false);
			return;
		}
		// What landed leaves the form; what was refused stays, with its reason.
		const keep = (values: Record<string, string>) =>
			Object.fromEntries(
				Object.entries(values).filter(([id]) => !done.includes(id)),
			);
		setQuantities(keep);
		setCosts(keep);
	};

	return (
		<section className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="font-bold text-base text-ink">{t("title")}</h2>
					<p className="text-ink-muted text-sm">{t("subtitle")}</p>
				</div>
				{!receiving && (
					<Button type="button" variant="outline" onClick={startReceiving}>
						<PackagePlus aria-hidden="true" />
						{t("receive")}
					</Button>
				)}
			</div>

			<div className="overflow-x-auto">
				<table className="w-full min-w-[560px] text-sm">
					<thead className="border-line border-b text-left text-ink-muted text-xs uppercase">
						<tr>
							<th className="py-2 pr-3 font-semibold">{t("colVariant")}</th>
							<th className="px-3 py-2 text-right font-semibold">
								{t("colAvailable")}
							</th>
							<th className="px-3 py-2 text-right font-semibold">
								{t("colReserved")}
							</th>
							<th className="px-3 py-2 text-right font-semibold">
								{t("colOnHand")}
							</th>
							{receiving ? (
								<>
									<th className="px-3 py-2 text-right font-semibold">
										{t("colReceived")}
									</th>
									{showCost && (
										<th className="px-3 py-2 text-right font-semibold">
											{t("colUnitCost")}
										</th>
									)}
								</>
							) : (
								<th className="py-2 pl-3">
									<span className="sr-only">{t("colActions")}</span>
								</th>
							)}
						</tr>
					</thead>
					<tbody className="divide-y divide-line">
						{variants.map((variant) => {
							const available = Math.max(
								0,
								variant.stockOnHand - variant.stockReserved,
							);
							const low =
								variant.lowStockThreshold != null &&
								available <= variant.lowStockThreshold;
							const label = labelOf(variant);
							return (
								<tr key={variant.id} className="align-top">
									<td className="py-3 pr-3">
										<p className="font-medium text-ink">{label}</p>
										<p className="text-ink-faint text-xs">
											{[
												variant.sku,
												variant.lowStockThreshold != null &&
													t("alertAt", {
														threshold: variant.lowStockThreshold,
													}),
											]
												.filter(Boolean)
												.join(" · ")}
										</p>
									</td>
									{variant.trackInventory ? (
										<>
											<td className="px-3 py-3 text-right">
												<span className="inline-flex items-center gap-2">
													{available === 0 ? (
														<StatusChip kind="out" />
													) : low ? (
														<StatusChip kind="low" />
													) : null}
													<span className="font-bold text-ink tabular-nums">
														{available.toLocaleString(locale)}
													</span>
												</span>
											</td>
											<td className="px-3 py-3 text-right text-ink-muted tabular-nums">
												{variant.stockReserved.toLocaleString(locale)}
											</td>
											<td className="px-3 py-3 text-right text-ink-muted tabular-nums">
												{variant.stockOnHand.toLocaleString(locale)}
											</td>
										</>
									) : (
										<td
											colSpan={3}
											className="px-3 py-3 text-right text-ink-faint text-xs"
										>
											{t("notTracked")}
										</td>
									)}
									{receiving ? (
										<>
											<td className="w-28 px-3 py-2">
												<NumberInput
													placeholder="0"
													aria-label={t("receivedFor", { variant: label })}
													aria-invalid={Boolean(lineErrors[variant.id])}
													value={quantities[variant.id] ?? ""}
													onValueChange={(digits) =>
														setQuantities((current) => ({
															...current,
															[variant.id]: digits,
														}))
													}
													className="h-9 text-right"
												/>
												{lineErrors[variant.id] && (
													<p className="mt-1 text-right text-bad-ink text-xs">
														{lineErrors[variant.id]}
													</p>
												)}
											</td>
											{showCost && (
												<td className="w-32 px-3 py-2">
													<NumberInput
														unit={currencyCode}
														aria-label={t("unitCostFor", { variant: label })}
														value={costs[variant.id] ?? ""}
														onValueChange={(digits) =>
															setCosts((current) => ({
																...current,
																[variant.id]: digits,
															}))
														}
														className="h-9 text-right"
													/>
												</td>
											)}
										</>
									) : (
										<td className="py-2 pl-3 text-right">
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() =>
													void StockAdjust.call({ variantId: variant.id })
												}
												className="text-[var(--shop-accent-text,var(--c-brand))]"
											>
												{t("adjust")}
											</Button>
										</td>
									)}
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{receiving && (
				<div className="flex flex-wrap items-end gap-3 border-line border-t pt-4">
					<div className="min-w-56 flex-1 space-y-1.5 text-sm">
						<label htmlFor="receipt-note" className="block text-ink-soft">
							{tStock("note")}
						</label>
						<Input
							id="receipt-note"
							value={note}
							maxLength={NOTE_MAX}
							onChange={(event) => setNote(event.target.value)}
						/>
					</div>
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={saving}
							onClick={() => setReceiving(false)}
						>
							{tStock("cancel")}
						</Button>
						<Button
							type="button"
							disabled={saving || units === 0}
							onClick={() => void saveReceipt()}
							className="bg-[var(--shop-accent,var(--c-brand-fill))] text-[var(--shop-on-accent,#FFFFFF)] hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
						>
							{saving && (
								<LoaderCircle aria-hidden="true" className="animate-spin" />
							)}
							{units > 0 ? t("saveReceiptUnits", { units }) : t("saveReceipt")}
						</Button>
					</div>
				</div>
			)}
		</section>
	);
}

function ProductHistory({
	shopId,
	productId,
	variants,
}: {
	shopId: string;
	productId: string;
	variants: VariantDoc[];
}) {
	const t = useTranslations("ProductStock");
	const tStock = useTranslations("Stock");
	const ts = useCatalogueStockT("stock");
	const router = useRouter();
	const pathname = usePathname();
	const search = useSearchParams();
	const filters = historyFiltersOf(
		search,
		variants.map((variant) => variant.id),
	);
	const movements = useMovements(shopId, {
		product: productId,
		variant: filters.variant ?? undefined,
		type: MOVEMENT_FILTERS[filters.type],
		page: filters.page,
		limit: PAGE_SIZE,
	});
	const go = (patch: Partial<HistoryFilters>) =>
		router.replace(
			`${pathname}${historySearch({ ...filters, page: 1, ...patch })}`,
			{ scroll: false },
		);
	const page = movements.data;

	return (
		<section className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-bold text-base text-ink">{t("historyTitle")}</h2>
				<div className="flex flex-wrap items-center gap-2">
					{(Object.keys(MOVEMENT_FILTERS) as MovementFilter[]).map((value) => (
						<button
							key={value}
							type="button"
							aria-pressed={filters.type === value}
							onClick={() => go({ type: value })}
							className={cn(
								"inline-flex h-8 items-center rounded-full border px-3 font-medium text-sm",
								filters.type === value
									? "border-ink bg-night font-semibold text-white"
									: "border-line bg-surface text-ink-soft hover:border-[var(--shop-accent-border,var(--c-brand-line))]",
							)}
						>
							{value === "reservation"
								? ts("reservationsFilter")
								: tStock(`filter.${value}`)}
						</button>
					))}
					{variants.length > 1 && (
						<select
							aria-label={t("variantFilter")}
							value={filters.variant ?? ""}
							onChange={(event) => go({ variant: event.target.value || null })}
							className="h-8 rounded-full border border-line bg-surface px-3 text-ink-soft text-sm"
						>
							<option value="">{t("allVariants")}</option>
							{variants.map((variant) => (
								<option key={variant.id} value={variant.id}>
									{variantLabel(variant.optionValues, tStock("defaultVariant"))}
								</option>
							))}
						</select>
					)}
				</div>
			</div>

			{movements.isPending && <LoadingRows />}
			{movements.isError && (
				<LoadError
					title={tStock("errorTitle")}
					onRetry={() => void movements.refetch()}
				/>
			)}
			{page && !movements.isError && (
				<div aria-busy={movements.isFetching} className="space-y-4">
					{page.docs.length === 0 ? (
						<p className="p-8 text-center text-ink-muted text-sm">
							{tStock("noMovements")}
						</p>
					) : (
						<>
							<MovementsTable rows={page.docs} />
							<div className="flex justify-end gap-2 text-sm">
								<button
									type="button"
									disabled={page.page <= 1}
									onClick={() => go({ page: filters.page - 1 })}
									className="h-9 rounded-lg border border-line bg-surface px-3 disabled:opacity-40"
								>
									{tStock("previous")}
								</button>
								<button
									type="button"
									disabled={!page.hasNextPage}
									onClick={() => go({ page: filters.page + 1 })}
									className="h-9 rounded-lg border border-line bg-surface px-3 disabled:opacity-40"
								>
									{tStock("next")}
								</button>
							</div>
						</>
					)}
				</div>
			)}
		</section>
	);
}
