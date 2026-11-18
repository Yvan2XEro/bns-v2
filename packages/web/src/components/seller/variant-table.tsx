"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent } from "react";
import type {
	Control,
	UseFormRegister,
	UseFormSetValue,
} from "react-hook-form";
import { useWatch } from "react-hook-form";
import {
	type IssueAt,
	ProductIssueText,
} from "~/components/seller/product-issue-text";
import { StockAdjust } from "~/components/seller/stock-adjust-drawer";
import { FormNumberInput } from "~/components/ui/number-input";
import { useCurrencyCode, useOrderMoney } from "~/hooks/use-order-money";
import { type ProductFormState, parseAmount } from "~/lib/product-form";
import { marginPercent, variantLabel } from "~/lib/variants";

const cell =
	"h-9 w-full rounded-md border border-line px-2 text-right text-sm outline-none focus:border-[var(--shop-accent-border,var(--c-brand-line))]";

interface VariantTableProps {
	control: Control<ProductFormState>;
	register: UseFormRegister<ProductFormState>;
	setValue: UseFormSetValue<ProductFormState>;
	showCost: boolean;
	issueAt: IssueAt;
}

const invalidCell = "border-red-500 focus:border-red-500";

export function VariantTable({
	control,
	register,
	setValue,
	showCost,
	issueAt,
}: VariantTableProps) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("ProductEditor");
	const currencyCode = useCurrencyCode();
	const locale = useLocale();
	const rows = useWatch({ control, name: "variants" }) ?? [];

	const applyFirstPrice = () => {
		const first = rows[0];
		if (!first) return;
		rows.forEach((_, index) => {
			setValue(`variants.${index}.price`, first.price, {
				shouldDirty: true,
				shouldValidate: true,
			});
			setValue(`variants.${index}.cost`, first.cost, { shouldDirty: true });
		});
	};

	// The adjustment is its own ledger write, saved at once; the form only
	// shows the new stock, so it is not marked as an edit to save.
	const adjust = async (index: number, variantId: string) => {
		const saved = await StockAdjust.call({ variantId });
		if (saved) setValue(`variants.${index}.stockOnHand`, saved.stockOnHand);
	};

	const quantityOf = (row: ProductFormState["variants"][number]) =>
		row.id ? (row.stockOnHand ?? 0) : (parseAmount(row.initialStock) ?? 0);
	const units = rows.reduce((sum, row) => sum + quantityOf(row), 0);
	const costValue = rows.reduce(
		(sum, row) => sum + (parseAmount(row.cost) ?? 0) * quantityOf(row),
		0,
	);
	const hasNew = rows.some((row) => !row.id);

	return (
		<div className="space-y-3">
			{rows.length > 1 && (
				<div className="flex items-center justify-between text-sm">
					<span className="text-ink-muted">
						{t("variantsGenerated", { count: rows.length })}
					</span>
					<button
						type="button"
						onClick={applyFirstPrice}
						className="font-semibold text-[var(--shop-accent-text,var(--c-brand))]"
					>
						{t("samePrice")}
					</button>
				</div>
			)}
			<div className="overflow-x-auto rounded-lg border border-line">
				<table className="w-full min-w-[620px] text-sm">
					<thead className="bg-canvas text-left text-ink-muted text-xs">
						<tr>
							<th className="px-3 py-2 font-semibold">{t("colVariant")}</th>
							<th className="px-3 py-2 font-semibold">
								{t("colPrice", { currency: currencyCode })}
							</th>
							{showCost && (
								<th className="px-3 py-2 font-semibold">{t("colCost")}</th>
							)}
							{showCost && (
								<th className="px-3 py-2 font-semibold">{t("colMargin")}</th>
							)}
							<th className="px-3 py-2 font-semibold">{t("colStock")}</th>
							<th className="px-3 py-2 font-semibold">{t("colThreshold")}</th>
							<th className="px-3 py-2 font-semibold">{t("colTracked")}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row, index) => {
							const at = (field: string) =>
								issueAt(`variants.${index}.${field}`);
							const cellFor = (field: string) =>
								at(field) ? `${cell} ${invalidCell}` : cell;
							const margin = marginPercent(
								parseAmount(row.price),
								parseAmount(row.cost),
							);
							return (
								<tr key={row.key} className="border-subtle border-t align-top">
									<td className="px-3 py-2">
										<p className="font-semibold text-ink">
											{variantLabel(row.optionValues, t("defaultVariant"))}
										</p>
										<input
											{...register(`variants.${index}.sku`)}
											placeholder={t("skuPlaceholder")}
											aria-label={t("skuPlaceholder")}
											aria-invalid={Boolean(at("sku"))}
											className={`mt-1 h-8 w-24 rounded-md border px-2 text-xs uppercase outline-none ${at("sku") ? invalidCell : "border-line focus:border-[var(--shop-accent-border,var(--c-brand-line))]"}`}
										/>
										<ProductIssueText issue={at("sku")} />
										<input
											{...register(`variants.${index}.barcode`)}
											inputMode="numeric"
											autoComplete="off"
											placeholder={t("barcodePlaceholder")}
											aria-label={t("barcodePlaceholder")}
											aria-invalid={Boolean(at("barcode"))}
											// A USB scanner ends its burst with Enter: keep it from saving the product.
											onKeyDown={(event) => {
												if (event.key === "Enter") event.preventDefault();
											}}
											className={`mt-1 block h-8 w-32 rounded-md border px-2 text-xs tabular-nums outline-none ${at("barcode") ? invalidCell : "border-line focus:border-[var(--shop-accent-border,var(--c-brand-line))]"}`}
										/>
										<ProductIssueText issue={at("barcode")} />
									</td>
									<td className="w-32 px-2 py-2">
										<FormNumberInput
											plain
											control={control}
											name={`variants.${index}.price`}
											aria-label={t("colPrice")}
											aria-invalid={Boolean(at("price"))}
											className={cellFor("price")}
										/>
										<ProductIssueText issue={at("price")} />
									</td>
									{showCost && (
										<td className="w-32 px-2 py-2">
											<FormNumberInput
												plain
												control={control}
												name={`variants.${index}.cost`}
												aria-label={t("colCost")}
												aria-invalid={Boolean(at("cost"))}
												className={cellFor("cost")}
											/>
											<ProductIssueText issue={at("cost")} />
										</td>
									)}
									{showCost && (
										<td className="w-20 px-3 py-2 pt-4 text-right text-ink-muted">
											{margin === null
												? "—"
												: `${margin.toLocaleString(locale, { maximumFractionDigits: 1 })} %`}
										</td>
									)}
									<td className="w-32 px-2 py-2">
										{row.id ? (
											<div className="pt-2 text-right">
												<p className="font-semibold text-ink tabular-nums">
													{(row.stockOnHand ?? 0).toLocaleString(locale)}
												</p>
												<button
													type="button"
													onClick={() => row.id && void adjust(index, row.id)}
													className="text-[var(--shop-accent-text,var(--c-brand))] text-xs hover:underline"
												>
													{t("adjust")}
												</button>
											</div>
										) : (
											<>
												<FormNumberInput
													plain
													control={control}
													name={`variants.${index}.initialStock`}
													disabled={!row.trackInventory}
													placeholder="0"
													aria-label={t("colStock")}
													aria-invalid={Boolean(at("initialStock"))}
													className={cellFor("initialStock")}
												/>
												<ProductIssueText issue={at("initialStock")} />
											</>
										)}
									</td>
									<td className="w-20 px-3 py-2">
										<FormNumberInput
											plain
											control={control}
											name={`variants.${index}.threshold`}
											aria-label={t("colThreshold")}
											aria-invalid={Boolean(at("threshold"))}
											className={cellFor("threshold")}
										/>
										<ProductIssueText issue={at("threshold")} />
									</td>
									<td className="w-16 px-3 py-2 pt-4 text-center">
										<input
											{...register(`variants.${index}.trackInventory`, {
												// An untracked variant holds no stock, so the
												// quantity typed into the disabled cell must not
												// travel with the save as an opening receipt.
												onChange: (event: ChangeEvent<HTMLInputElement>) => {
													if (event.target.checked || row.id) return;
													setValue(`variants.${index}.initialStock`, "", {
														shouldDirty: true,
														shouldValidate: true,
													});
												},
											})}
											type="checkbox"
											className="h-4 w-4 accent-[var(--shop-accent,var(--c-brand))]"
											aria-label={t("colTracked")}
										/>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-2 text-ink-muted text-xs">
				<span>
					{hasNew
						? t("initialStockNote", { count: units })
						: t("unitsInStock", { count: units })}
				</span>
				{showCost && (
					<span>{t("costValue", { value: formatOrderMoney(costValue) })}</span>
				)}
			</div>
		</div>
	);
}
