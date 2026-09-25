"use client";

import { useTranslations } from "next-intl";
import type { Control } from "react-hook-form";
import { useWatch } from "react-hook-form";
import type { ProductFormState } from "~/lib/product-form";
import { TITLE_MIN } from "~/lib/product-form";

/** What is still missing before the product can go on sale, on the creation page. */
export function ProductChecklistCard({
	control,
}: {
	control: Control<ProductFormState>;
}) {
	const t = useTranslations("ProductEditor");
	// Named fields, not the whole form: a keystroke in the description or in a
	// SKU has no business re-rendering the checklist.
	const [
		title,
		categoryId,
		variants,
		codAllowed,
		pickupAllowed,
		existingImages,
		newImages,
	] = useWatch({
		control,
		name: [
			"title",
			"categoryId",
			"variants",
			"codAllowed",
			"pickupAllowed",
			"existingImages",
			"newImages",
		],
	});

	const photoCount = existingImages.length + newImages.length;
	const items = [
		{
			ok: title.trim().length >= TITLE_MIN && Boolean(categoryId),
			label: t("checkTitle"),
		},
		{
			ok:
				variants.length > 0 && variants.every((row) => row.price.trim() !== ""),
			label: t("checkPrice", { count: variants.length }),
		},
		{
			ok: codAllowed || pickupAllowed,
			label: t("checkDelivery"),
		},
		{
			ok: photoCount > 0,
			label: t("checkPhotos", { count: photoCount }),
		},
	];

	return (
		<div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
			<h2 className="font-bold text-[#0F172A]">{t("beforePublish")}</h2>
			<ul className="mt-3 space-y-2 text-sm">
				{items.map((item) => (
					<li
						key={item.label}
						className={item.ok ? "text-[#166534]" : "text-[#64748B]"}
					>
						{item.ok ? "✓" : "○"} {item.label}
					</li>
				))}
			</ul>
			<p className="mt-4 text-[#64748B] text-xs">{t("autoListingNote")}</p>
		</div>
	);
}
