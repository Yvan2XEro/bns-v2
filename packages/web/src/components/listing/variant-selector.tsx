"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { productVariantsQuery } from "~/hooks/use-variants";
import { formatXaf } from "~/lib/money";
import { cn } from "~/lib/utils";
import { availableOf } from "~/lib/variants";
import type { VariantDoc } from "~/types";

function inStock(variant: VariantDoc): boolean {
	return !variant.trackInventory || availableOf(variant) > 0;
}

/**
 * Buyer-facing. The API only ever returns live variants of a published
 * product (`PUBLIC_VARIANTS` in ProductVariants.ts), and `cost` is stripped
 * at the field level — but `stockOnHand`/`stockReserved` are not yet, so an
 * anonymous visitor's network response currently carries the raw counts (an
 * API-side fix is tracked separately). This component never reads those
 * fields itself: it only goes through `inStock`/`availableOf`, so it keeps
 * working once a buyer response stops carrying the raw numbers.
 */
export function VariantSelector({
	productId,
	codAllowed,
	pickupAllowed,
}: {
	productId: string;
	codAllowed: boolean;
	pickupAllowed: boolean;
}) {
	const t = useTranslations("Listing");
	const locale = useLocale();
	const { data } = useQuery(productVariantsQuery(productId));
	const variants = useMemo(() => data?.docs ?? [], [data]);

	const match = useMemo(() => {
		return (values: Record<string, string>) =>
			variants.find((variant) =>
				Object.entries(variant.optionValues ?? {}).every(
					([name, value]) => values[name] === value,
				),
			) ?? null;
	}, [variants]);

	// The seller picks a value per click; the starting point is derived from
	// the loaded variants rather than synced through an effect. If a refetch
	// makes the manual pick unavailable (or it no longer matches any variant),
	// the derivation falls back to the default rather than keeping a stale,
	// now-unselectable combination on screen.
	const [manualSelection, setManualSelection] = useState<Record<
		string,
		string
	> | null>(null);
	const defaultVariant = useMemo(
		() => variants.find(inStock) ?? variants[0] ?? null,
		[variants],
	);
	const manualMatch = manualSelection ? match(manualSelection) : null;
	const manualValid = manualMatch !== null && inStock(manualMatch);
	const selected =
		manualValid && manualSelection
			? manualSelection
			: (defaultVariant?.optionValues ?? {});

	const options = useMemo(() => {
		const names: string[] = [];
		const values = new Map<string, string[]>();
		for (const variant of variants) {
			for (const [name, value] of Object.entries(variant.optionValues ?? {})) {
				if (!values.has(name)) {
					names.push(name);
					values.set(name, []);
				}
				const list = values.get(name) as string[];
				if (!list.includes(value)) list.push(value);
			}
		}
		return names.map((name) => ({ name, values: values.get(name) ?? [] }));
	}, [variants]);

	const current = match(selected);

	if (variants.length === 0) return null;

	return (
		<div className="mt-4 space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-5">
			{options.map((option) => (
				<div key={option.name}>
					<p className="text-[#64748B] text-sm">
						{option.name} :{" "}
						<span className="font-semibold text-[#0F172A]">
							{selected[option.name]}
						</span>
					</p>
					<div className="mt-2 flex flex-wrap gap-2">
						{option.values.map((value) => {
							const candidate = match({ ...selected, [option.name]: value });
							const soldOut = !candidate || !inStock(candidate);
							const active = selected[option.name] === value;
							return (
								<button
									key={value}
									type="button"
									disabled={soldOut}
									aria-pressed={active}
									aria-label={
										soldOut ? `${value} — ${t("variantSoldOut")}` : value
									}
									onClick={() =>
										setManualSelection({ ...selected, [option.name]: value })
									}
									className={cn(
										"rounded-lg border px-3 py-1.5 font-medium text-sm",
										active
											? "border-[#1E40AF] bg-[#EFF6FF] text-[#1E40AF]"
											: "border-[#E2E8F0] text-[#334155]",
										soldOut &&
											"cursor-not-allowed text-[#94A3B8] line-through opacity-60",
									)}
								>
									{value}
								</button>
							);
						})}
					</div>
				</div>
			))}
			{current && (
				<div className="flex items-center justify-between rounded-lg bg-[#F8FAFC] px-3 py-2 text-sm">
					<span
						className={inStock(current) ? "text-[#166534]" : "text-[#991b1b]"}
					>
						{!current.trackInventory
							? t("variantInStock")
							: availableOf(current) > 0
								? t("variantAvailable", { count: availableOf(current) })
								: t("variantSoldOut")}
					</span>
					<span className="font-bold text-[#0F172A]">
						{formatXaf(current.price, locale)}
					</span>
				</div>
			)}
			{(codAllowed || pickupAllowed) && (
				<p className="text-[#64748B] text-xs">
					{[
						codAllowed && t("codAvailable"),
						pickupAllowed && t("pickupAvailable"),
					]
						.filter(Boolean)
						.join(" · ")}
				</p>
			)}
		</div>
	);
}
