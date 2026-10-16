"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState } from "react";
import { useOrderMoney } from "~/hooks/use-order-money";
import { publicVariantsQuery } from "~/hooks/use-variants";
import { cn } from "~/lib/utils";
import {
	colourSwatch,
	isColourOption,
	isPaleSwatch,
	optionValuePrice,
	stockStatus,
} from "~/lib/variant-display";
import {
	isOptionValueUnavailable,
	isVariantInStock,
	matchVariant,
	resolveSelection,
} from "~/lib/variants";
import type { PublicVariantDoc } from "~/types";

/**
 * Buyer-facing. Reads `GET /api/public/products/:id/variants`, which always
 * applies `PUBLIC_VARIANTS` (live product, unarchived variant) no matter who
 * is asking — unlike the raw `/api/product-variants` the seller-facing
 * `VariantPicker` uses, which legitimately widens for a shop member's own
 * draft product. The response carries no `cost` and no `stockOnHand`/
 * `stockReserved`, only the server-derived `available` boolean and a count
 * the server caps (`availableCount`), so this component never computes stock
 * client-side.
 */
export function VariantSelector({
	productId,
	priceFallback,
	codAllowed,
	pickupAllowed,
	children,
}: {
	productId: string;
	/** The product's price or range, shown until a variant is selected. */
	priceFallback: string;
	codAllowed: boolean;
	pickupAllowed: boolean;
	/** The buy box's controls, given the variant currently selected (null while none matches). */
	children?: (variant: PublicVariantDoc | null) => ReactNode;
}) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Listing");
	const locale = useLocale();
	const { data } = useQuery(publicVariantsQuery(productId));
	const variants = useMemo(() => data?.docs ?? [], [data]);

	// The buyer picks a value per click; the starting point is derived from
	// the loaded variants rather than synced through an effect. If a refetch
	// makes the manual pick unavailable (or it no longer matches any variant),
	// the derivation falls back to the default rather than keeping a stale,
	// now-unselectable combination on screen.
	const [manualSelection, setManualSelection] = useState<Record<
		string,
		string
	> | null>(null);
	const defaultVariant = useMemo(
		() => variants.find(isVariantInStock) ?? variants[0] ?? null,
		[variants],
	);
	const manualMatch = manualSelection
		? matchVariant(variants, manualSelection)
		: null;
	const manualValid = manualMatch !== null && isVariantInStock(manualMatch);
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

	const current = matchVariant(variants, selected);

	const stock = current ? stockStatus(current) : null;

	return (
		<div className="space-y-[18px]">
			<div className="space-y-1.5">
				<p className="font-bold text-3xl text-brand">
					{current ? formatOrderMoney(current.price, locale) : priceFallback}
				</p>
				{stock && (
					<p
						className={cn(
							"flex items-center gap-1.5 font-semibold text-sm",
							stock.kind === "inStock" ? "text-ok-ink-soft" : "text-bad-ink",
						)}
					>
						<span
							aria-hidden="true"
							className={cn(
								"h-2 w-2 rounded-full",
								stock.kind === "inStock" ? "bg-ok" : "bg-bad",
							)}
						/>
						{stock.kind === "soldOut"
							? t("variantSoldOut")
							: stock.count !== null
								? t("variantInStockCount", { count: stock.count })
								: t("variantInStock")}
					</p>
				)}
			</div>
			{options.map((option) => {
				const colour = isColourOption(option.name);
				return (
					<div key={option.name}>
						<p className="font-semibold text-[13px] text-ink-soft">
							{option.name}
							{selected[option.name] && ` : ${selected[option.name]}`}
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
							{option.values.map((value) => {
								// Unavailable everywhere → genuinely unselectable. Available in
								// some other combination → selectable; picking it resolves the
								// rest of the selection to a combination that is actually in
								// stock, rather than a dead end the buyer cannot buy from.
								const unavailable = isOptionValueUnavailable(
									variants,
									option.name,
									value,
								);
								const active = selected[option.name] === value;
								const swatch = colour ? colourSwatch(value) : null;
								const otherPrice = unavailable
									? null
									: optionValuePrice(variants, selected, option.name, value);
								return (
									<button
										key={value}
										type="button"
										disabled={unavailable}
										aria-pressed={active}
										aria-label={
											unavailable
												? `${value} — ${t("variantSoldOut")}`
												: undefined
										}
										onClick={() =>
											setManualSelection(
												resolveSelection(
													variants,
													selected,
													option.name,
													value,
												),
											)
										}
										className={cn(
											"flex h-[38px] items-center gap-1.5 rounded-lg px-3.5 font-medium text-sm",
											active
												? "border-2 border-brand bg-brand-soft font-semibold text-brand"
												: "border border-line bg-surface text-ink-soft",
											unavailable &&
												"cursor-not-allowed text-ink-faint line-through opacity-60",
										)}
									>
										{swatch && (
											<span
												aria-hidden="true"
												className={cn(
													"h-3.5 w-3.5 rounded-full",
													isPaleSwatch(swatch) && "border border-line-strong",
												)}
												style={{ background: swatch }}
											/>
										)}
										{value}
										{otherPrice !== null && (
											<span className="font-normal text-ink-muted">
												· {formatOrderMoney(otherPrice, locale)}
											</span>
										)}
									</button>
								);
							})}
						</div>
					</div>
				);
			})}
			{(codAllowed || pickupAllowed) && (
				<p className="text-ink-muted text-xs">
					{[
						codAllowed && t("codAvailable"),
						pickupAllowed && t("pickupAvailable"),
					]
						.filter(Boolean)
						.join(" · ")}
				</p>
			)}
			{children?.(current)}
		</div>
	);
}
