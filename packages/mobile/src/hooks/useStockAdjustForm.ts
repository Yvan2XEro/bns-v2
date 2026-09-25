import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	useRecordMovement,
	useVariant,
	type VariantWithProduct,
} from "@/src/hooks/useShops";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	emptyStockAdjustForm,
	movementFromForm,
	type StockAdjustFormValues,
	stockAdjustSchema,
} from "@/src/lib/stockAdjust";
import type { ManualMovementType } from "@/src/types/api";

/**
 * Owns the sheet's data (the variant behind `variantId`) and its form: the
 * counted-stock-to-signed-delta conversion is `movementFromForm`'s job, but
 * loading the variant, wiring the zod schema to its current stock, guarding
 * against a double tap and mapping a server refusal back onto the form all
 * belong here, out of the screen's render logic.
 */
export function useStockAdjustForm(variantId: string | undefined) {
	const { t } = useTranslation();
	const { showSuccess } = useAlert();
	const variant = useVariant(variantId);
	const record = useRecordMovement();
	// A ref, not state: must block a second tap in the same tick, before
	// `record.isPending` has had a chance to re-render.
	const submittingRef = useRef(false);

	const v: VariantWithProduct | undefined = variant.data;
	const current = v?.stockOnHand ?? 0;

	const resolver = useMemo(
		() => zodResolver(stockAdjustSchema(current)),
		[current],
	);
	const form = useForm<StockAdjustFormValues>({
		resolver,
		defaultValues: emptyStockAdjustForm,
		mode: "onChange",
	});

	const type = form.watch("type");
	const amount = form.watch("amount");
	const result = v ? movementFromForm(type, current, amount) : null;

	/**
	 * `setValue(..., { shouldValidate: true })` only re-applies the resolver's
	 * verdict to the field(s) it was told to validate — a stale error on a
	 * field the schema no longer touches (e.g. `unitCost` once the type isn't
	 * `receipt`) survives untouched (a known react-hook-form + resolver
	 * gotcha). A whole-form `trigger()` re-validates every field and replaces
	 * `formState.errors` wholesale, so a field that left the active schema
	 * has its error cleared along with everything else.
	 */
	function changeType(next: ManualMovementType) {
		form.setValue("type", next, { shouldDirty: true });
		form.setValue("amount", "", { shouldDirty: true });
		void form.trigger();
	}

	const submit = form.handleSubmit((values) => {
		if (!v || submittingRef.current || record.isPending) return;
		const movement = movementFromForm(values.type, current, values.amount);
		if (!movement) return;
		submittingRef.current = true;
		const cost = values.unitCost.trim() ? Number(values.unitCost) : null;
		record.mutate(
			{
				variantId: v.id,
				type: values.type,
				quantity: movement.quantity,
				...(values.type === "receipt" && cost !== null && cost > 0
					? { unitCost: cost }
					: {}),
				...(values.note.trim() ? { note: values.note.trim() } : {}),
			},
			{
				onSuccess: () => {
					showSuccess(
						t("stock.savedTitle"),
						t("stock.savedMessage", { count: movement.stockAfter }),
					);
					router.back();
				},
				onError: (error) => {
					submittingRef.current = false;
					// The ledger's refusal (e.g. units already reserved) is shown
					// verbatim on the field and never retried; the sheet keeps the
					// value the seller typed so they can see what was rejected.
					form.setError("amount", { message: resolveErrorMessage(error, t) });
				},
			},
		);
	});

	return {
		variant,
		v,
		current,
		form,
		type,
		amount,
		result,
		changeType,
		submit,
		isPending: record.isPending,
	};
}
