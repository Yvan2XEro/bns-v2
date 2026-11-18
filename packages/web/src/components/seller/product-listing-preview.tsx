"use client";

import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Control } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { useOrderMoney } from "~/hooks/use-order-money";
import { formatOrderMoneyRange } from "~/lib/order-money";
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
	const formatOrderMoney = useOrderMoney();
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
		<div className="rounded-xl border border-line bg-surface p-5">
			<div className="flex items-baseline justify-between gap-2">
				<h2 className="font-bold text-ink">{t("previewTitle")}</h2>
				<span className="text-ink-muted text-xs">{t("previewCaption")}</span>
			</div>
			<div className="mt-3 overflow-hidden rounded-xl border border-line">
				<div className="flex h-36 items-center justify-center bg-subtle">
					{cover ? (
						// biome-ignore lint/performance/noImgElement: local object URL or media host
						<img src={cover} alt="" className="h-full w-full object-cover" />
					) : (
						<ImageIcon aria-hidden="true" className="h-8 w-8 text-ink-faint" />
					)}
				</div>
				<div className="p-3">
					<p className="font-bold text-ink text-lg">
						{prices.length > 0
							? formatOrderMoneyRange(
									formatOrderMoney,
									Math.min(...prices),
									Math.max(...prices),
								)
							: "—"}
					</p>
					<p className="text-ink-soft text-sm">
						{title.trim() || t("untitled")}
					</p>
				</div>
			</div>
			<ul className="mt-3 space-y-1 text-ink-soft text-sm">
				<li>{t("unitsInStock", { count: units })}</li>
				{codAllowed && <li>{t("cod")}</li>}
				{pickupAllowed && <li>{t("pickup")}</li>}
			</ul>
		</div>
	);
}
