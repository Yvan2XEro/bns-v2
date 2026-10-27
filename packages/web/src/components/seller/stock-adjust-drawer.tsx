"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { createCallable } from "react-call";
import { CLOSE_ANIMATION_MS } from "~/components/callable/callable";
import { Sheet, SheetContent } from "~/components/ui/sheet";
import { useVariant } from "~/hooks/use-variants";
import type { MovementFormState } from "~/lib/stock";
import type { VariantDoc } from "~/types";
import { StockAdjustForm } from "./stock-adjust-form";
import { type PickedVariant, toPicked, VariantPicker } from "./variant-picker";

/**
 * Pick a variant (unless one is given), then record one movement for it;
 * `onOpenChange(false)` means "done".
 */
function StockAdjustBody({
	shopId,
	initialVariantId,
	onOpenChange,
	onSaved,
	defaults,
}: {
	shopId: string;
	initialVariantId: string | null;
	onOpenChange: (open: boolean) => void;
	onSaved: (variant: VariantDoc) => void;
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
		return <p className="text-ink-muted text-sm">{t("loadingVariant")}</p>;
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
			onSaved={(saved) => {
				onSaved(saved);
				onOpenChange(false);
			}}
			onCancel={() => onOpenChange(false)}
		/>
	);
}

/**
 * The adjust sheet, opened in place from wherever stock shows:
 * `await StockAdjust.call({ variantId })` resolves with the variant as the
 * ledger left it, or null when the sheet is closed without saving. Without a
 * variant it starts on the product search; `defaults` presets the form (the
 * stock page's "record a receipt"). The page stays where it is (an unsaved
 * product form keeps its edits). Mounted once, with the shop, by the seller
 * shell.
 */
export const StockAdjust = createCallable<
	{ variantId?: string; defaults?: Partial<MovementFormState> },
	VariantDoc | null,
	{ shopId: string }
>(({ call, variantId, defaults }) => {
	const t = useTranslations("Stock");
	const close = () => call.end(null);

	return (
		<Sheet
			open={!call.ended}
			onOpenChange={(open) => {
				if (!open) close();
			}}
		>
			<SheetContent title={t("adjustTitle")} description={t("adjustSubtitle")}>
				<StockAdjustBody
					shopId={call.root.shopId}
					initialVariantId={variantId ?? null}
					defaults={defaults}
					onOpenChange={(open) => {
						if (!open) close();
					}}
					onSaved={(saved) => call.end(saved)}
				/>
			</SheetContent>
		</Sheet>
	);
}, CLOSE_ANIMATION_MS);
