"use client";

import { ImageIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Control } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { formatXafRange } from "~/lib/money";
import { type ProductFormState, parseAmount } from "~/lib/product-form";

/**
 * The search card this product will publish. A product publishes exactly one
 * listing and every field of it is derived here, so the preview is built from
 * the form rather than from anything the seller could edit separately.
 */
export function ProductListingPreview({
	control,
}: {
	control: Control<ProductFormState>;
}) {
	const t = useTranslations("ProductEditor");
	const locale = useLocale();
	// Named fields, not the whole form: only what the card actually draws.
	const [
		title,
		variants,
		codAllowed,
		pickupAllowed,
		existingImages,
		newImages,
	] = useWatch({
		control,
		name: [
			"title",
			"variants",
			"codAllowed",
			"pickupAllowed",
			"existingImages",
			"newImages",
		],
	});

	const prices = variants
		.map((row) => parseAmount(row.price))
		.filter((price): price is number => price !== null);
	const units = variants.reduce(
		(sum, row) => sum + (parseAmount(row.initialStock) ?? 0),
		0,
	);
	const cover = existingImages[0]?.url || newImages[0]?.preview || "";

	return (
		<div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
			<div className="flex items-baseline justify-between gap-2">
				<h2 className="font-bold text-[#0F172A]">{t("previewTitle")}</h2>
				<span className="text-[#64748B] text-xs">{t("previewCaption")}</span>
			</div>
			<div className="mt-3 overflow-hidden rounded-xl border border-[#E2E8F0]">
				<div className="flex h-36 items-center justify-center bg-[#F1F5F9]">
					{cover ? (
						// biome-ignore lint/performance/noImgElement: local object URL or media host
						<img src={cover} alt="" className="h-full w-full object-cover" />
					) : (
						<ImageIcon aria-hidden="true" className="h-8 w-8 text-[#94A3B8]" />
					)}
				</div>
				<div className="p-3">
					<p className="font-bold text-[#0F172A] text-lg">
						{prices.length > 0
							? formatXafRange(Math.min(...prices), Math.max(...prices), locale)
							: "—"}
					</p>
					<p className="text-[#334155] text-sm">
						{title.trim() || t("untitled")}
					</p>
				</div>
			</div>
			<ul className="mt-3 space-y-1 text-[#334155] text-sm">
				<li>{t("unitsInStock", { count: units })}</li>
				{codAllowed && <li>{t("cod")}</li>}
				{pickupAllowed && <li>{t("pickup")}</li>}
			</ul>
		</div>
	);
}
