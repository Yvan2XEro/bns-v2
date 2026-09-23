"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useCatalogue } from "~/hooks/use-catalogue";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import { productVariantsQuery } from "~/hooks/use-variants";
import { variantLabel } from "~/lib/variants";
import type { CatalogueRow, VariantDoc } from "~/types";

const SEARCH_DEBOUNCE_MS = 250;
const RESULT_LIMIT = 8;

export interface PickedVariant {
	id: string;
	label: string;
	productTitle: string;
	stockOnHand: number;
	stockReserved: number;
	lowStockThreshold: number | null;
}

export function toPicked(
	variant: Pick<
		VariantDoc,
		| "id"
		| "optionValues"
		| "stockOnHand"
		| "stockReserved"
		| "lowStockThreshold"
	>,
	productTitle: string,
	fallback: string,
): PickedVariant {
	return {
		id: variant.id,
		label: variantLabel(variant.optionValues, fallback),
		productTitle,
		stockOnHand: variant.stockOnHand,
		stockReserved: variant.stockReserved,
		lowStockThreshold: variant.lowStockThreshold,
	};
}

const rowClass =
	"flex w-full items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] px-3 py-2 text-left text-sm hover:border-[#93C5FD] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF]";

export function VariantPicker({
	shopId,
	onPick,
}: {
	shopId: string;
	onPick: (variant: PickedVariant) => void;
}) {
	const t = useTranslations("Stock");
	const queryClient = useQueryClient();
	const [query, setQuery] = useState("");
	const [openProduct, setOpenProduct] = useState<CatalogueRow | null>(null);
	const [variants, setVariants] = useState<VariantDoc[]>([]);
	const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);

	const { data, isPending } = useCatalogue(shopId, {
		q: debouncedQuery || undefined,
		page: 1,
		limit: RESULT_LIMIT,
	});

	async function choose(product: CatalogueRow) {
		const docs = (
			await queryClient.fetchQuery(productVariantsQuery(product.id))
		).docs;
		if (docs.length === 1) {
			onPick(toPicked(docs[0], product.title, t("defaultVariant")));
			return;
		}
		setOpenProduct(product);
		setVariants(docs);
	}

	if (openProduct) {
		return (
			<div className="space-y-2">
				<button
					type="button"
					onClick={() => setOpenProduct(null)}
					className="inline-flex items-center gap-1.5 text-[#1E40AF] text-sm hover:underline"
				>
					<ArrowLeft aria-hidden="true" className="h-4 w-4" />
					{openProduct.title}
				</button>
				{variants.map((variant) => (
					<button
						key={variant.id}
						type="button"
						onClick={() =>
							onPick(toPicked(variant, openProduct.title, t("defaultVariant")))
						}
						className={rowClass}
					>
						<span className="truncate">
							{variantLabel(variant.optionValues, t("defaultVariant"))}
						</span>
						<span className="shrink-0 text-[#64748B]">
							{t("inStock", { count: variant.stockOnHand })}
						</span>
					</button>
				))}
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<div className="relative">
				<Search
					aria-hidden="true"
					className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-[#94A3B8]"
				/>
				<input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					aria-label={t("pickPlaceholder")}
					placeholder={t("pickPlaceholder")}
					className="h-10 w-full rounded-lg border border-[#E2E8F0] pr-3 pl-9 text-sm outline-none focus:border-[#93C5FD]"
				/>
			</div>
			{!isPending && data?.docs.length === 0 && (
				<p className="px-1 py-3 text-[#64748B] text-sm">{t("noProduct")}</p>
			)}
			{data?.docs.map((product) => (
				<button
					key={product.id}
					type="button"
					onClick={() => void choose(product)}
					className={rowClass}
				>
					<span className="truncate font-medium text-[#0F172A]">
						{product.title}
					</span>
					<span className="shrink-0 text-[#64748B]">
						{product.variantCount > 1
							? t("variantsCount", { count: product.variantCount })
							: t("inStock", { count: product.stockOnHand })}
					</span>
				</button>
			))}
		</div>
	);
}
