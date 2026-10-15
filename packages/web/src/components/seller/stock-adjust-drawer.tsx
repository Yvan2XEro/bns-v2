"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "~/components/ui/dialog";
import { useVariant } from "~/hooks/use-variants";
import type { MovementFormState } from "~/lib/stock";
import { StockAdjustForm } from "./stock-adjust-form";
import { type PickedVariant, toPicked, VariantPicker } from "./variant-picker";

export function StockAdjustDrawer({
	shopId,
	open,
	onOpenChange,
	initialVariantId,
	onSaved,
	defaults,
}: {
	shopId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialVariantId?: string | null;
	onSaved: () => void;
	defaults?: Partial<MovementFormState>;
}) {
	const t = useTranslations("Stock");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="top-0 right-0 left-auto h-full max-w-md translate-x-0 translate-y-0 space-y-5 overflow-y-auto rounded-none sm:rounded-none">
				<div className="space-y-1">
					<DialogTitle>{t("adjustTitle")}</DialogTitle>
					<DialogDescription>{t("adjustSubtitle")}</DialogDescription>
				</div>
				{/* Radix unmounts the content when the drawer closes, so the body
				    starts from a clean form on every opening. */}
				<StockAdjustBody
					shopId={shopId}
					initialVariantId={initialVariantId ?? null}
					onOpenChange={onOpenChange}
					onSaved={onSaved}
					defaults={defaults}
				/>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Pick a variant, then record one movement for it. Shared by the drawer and
 * the stock page's fixed side panel; `onOpenChange(false)` means "done".
 */
export function StockAdjustBody({
	shopId,
	initialVariantId,
	onOpenChange,
	onSaved,
	defaults,
}: {
	shopId: string;
	initialVariantId: string | null;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
	defaults?: Partial<MovementFormState>;
}) {
	const t = useTranslations("Stock");
	const [picked, setPicked] = useState<PickedVariant | null>(null);
	const deepLinked = useVariant(initialVariantId);

	const linked = deepLinked.data;
	const variant =
		picked ??
		(linked
			? toPicked(
					linked,
					typeof linked.product === "object" ? linked.product.title : "",
					t("defaultVariant"),
				)
			: null);

	if (initialVariantId && deepLinked.isPending) {
		return <p className="text-[#64748B] text-sm">{t("loadingVariant")}</p>;
	}

	if (!variant) {
		return <VariantPicker shopId={shopId} onPick={setPicked} />;
	}

	return (
		<StockAdjustForm
			key={variant.id}
			shopId={shopId}
			variant={variant}
			defaults={defaults}
			onChangeVariant={initialVariantId ? null : () => setPicked(null)}
			onSaved={() => {
				onSaved();
				onOpenChange(false);
			}}
			onCancel={() => onOpenChange(false)}
		/>
	);
}
