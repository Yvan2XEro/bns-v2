"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { ProductEditor } from "~/components/seller/product-editor";
import { useProductDetail } from "~/hooks/use-product-detail";
import { productTabOf } from "~/lib/product-tabs";
import type { Category } from "~/types";

export function ProductEditorLoader({
	productId,
	shopId,
	categories,
}: {
	productId: string;
	shopId: string;
	categories: Category[];
}) {
	const t = useTranslations("ProductEditor");
	const { data, isError, refetch } = useProductDetail(shopId, productId);
	const tab = productTabOf(useSelectedLayoutSegment());

	if (isError) {
		return <LoadError title={t("loadError")} onRetry={() => void refetch()} />;
	}
	if (!data) return <LoadingRows rows={6} />;

	return (
		<ProductEditor
			shopId={shopId}
			categories={categories}
			role={data.role}
			detail={{ productId, response: data }}
			tab={tab}
		/>
	);
}
