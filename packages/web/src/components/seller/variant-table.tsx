"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent } from "react";
import type {
	Control,
	UseFormRegister,
	UseFormSetValue,
} from "react-hook-form";
import { useWatch } from "react-hook-form";
import { formatXaf } from "~/lib/money";
import { type ProductFormState, parseAmount } from "~/lib/product-form";
import { marginPercent, variantLabel } from "~/lib/variants";

const cell =
	"h-9 w-full rounded-md border border-[#E2E8F0] px-2 text-right text-sm outline-none focus:border-[#93C5FD]";

interface VariantTableProps {
	control: Control<ProductFormState>;
	register: UseFormRegister<ProductFormState>;
	setValue: UseFormSetValue<ProductFormState>;
	showCost: boolean;
}

export function VariantTable({
	control,
	register,
	setValue,
	showCost,
}: VariantTableProps) {
	const t = useTranslations("ProductEditor");
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
					<span className="text-[#64748B]">
						{t("variantsGenerated", { count: rows.length })}
					</span>
					<button
						type="button"
						onClick={applyFirstPrice}
						className="font-semibold text-[#1E40AF]"
					>
						{t("samePrice")}
					</button>
				</div>
			)}
			<div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
				<table className="w-full min-w-[760px] text-sm">
					<thead className="bg-[#F8FAFC] text-left text-[#64748B] text-xs">
						<tr>
							<th className="px-3 py-2 font-semibold">{t("colVariant")}</th>
							<th className="px-3 py-2 font-semibold">{t("colPrice")}</th>
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
							const margin = marginPercent(
								parseAmount(row.price),
								parseAmount(row.cost),
							);
							return (
								<tr
									key={row.key}
									className="border-[#F1F5F9] border-t align-top"
								>
									<td className="px-3 py-2">
										<p className="font-semibold text-[#0F172A]">
											{variantLabel(row.optionValues, t("defaultVariant"))}
										</p>
										<input
											{...register(`variants.${index}.sku`)}
											placeholder={t("skuPlaceholder")}
											aria-label={t("skuPlaceholder")}
											className="mt-1 h-8 w-40 rounded-md border border-[#E2E8F0] px-2 text-xs uppercase outline-none focus:border-[#93C5FD]"
										/>
									</td>
									<td className="w-32 px-3 py-2">
										<input
											{...register(`variants.${index}.price`)}
											inputMode="numeric"
											aria-label={t("colPrice")}
											className={cell}
										/>
									</td>
									{showCost && (
										<td className="w-32 px-3 py-2">
											<input
												{...register(`variants.${index}.cost`)}
												inputMode="numeric"
												aria-label={t("colCost")}
												className={cell}
											/>
										</td>
									)}
									{showCost && (
										<td className="w-20 px-3 py-2 pt-4 text-right text-[#64748B]">
											{margin === null
												? "—"
												: `${margin.toLocaleString(locale, { maximumFractionDigits: 1 })} %`}
										</td>
									)}
									<td className="w-28 px-3 py-2">
										{row.id ? (
											<div className="pt-2 text-right">
												<p className="font-semibold text-[#0F172A]">
													{row.stockOnHand ?? 0}
												</p>
												<Link
													href={`/seller/stock?adjust=${row.id}`}
													className="text-[#1E40AF] text-xs hover:underline"
												>
													{t("adjust")}
												</Link>
											</div>
										) : (
											<input
												{...register(`variants.${index}.initialStock`)}
												inputMode="numeric"
												disabled={!row.trackInventory}
												placeholder="0"
												aria-label={t("colStock")}
												className={cell}
											/>
										)}
									</td>
									<td className="w-24 px-3 py-2">
										<input
											{...register(`variants.${index}.threshold`)}
											inputMode="numeric"
											aria-label={t("colThreshold")}
											className={cell}
										/>
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
											className="h-4 w-4 accent-[#1E40AF]"
											aria-label={t("colTracked")}
										/>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-2 text-[#64748B] text-xs">
				<span>
					{hasNew
						? t("initialStockNote", { count: units })
						: t("unitsInStock", { count: units })}
				</span>
				{showCost && (
					<span>{t("costValue", { value: formatXaf(costValue) })}</span>
				)}
			</div>
		</div>
	);
}
