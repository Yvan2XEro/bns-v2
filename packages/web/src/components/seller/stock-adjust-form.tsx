"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { type Resolver, useForm, useWatch } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useCurrencyCode } from "~/hooks/use-order-money";
import { useRecordMovement } from "~/hooks/use-record-movement";
import { ApiError, ERROR_CODES, resolveErrorMessage } from "~/lib/apiError";
import { parseAmount } from "~/lib/product-form";
import { shopApi } from "~/lib/shop-api";
import {
	amountAfterTypeChange,
	emptyMovementForm,
	type MovementFormState,
	movementDelta,
	movementFormSchema,
	NOTE_MAX,
} from "~/lib/stock";
import { cn } from "~/lib/utils";
import type { VariantDoc } from "~/types";
import { MovementTypePicker } from "./movement-type-picker";
import type { PickedVariant } from "./variant-picker";

export function StockAdjustForm({
	shopId,
	variant,
	onChangeVariant,
	onSaved,
	onCancel,
	defaults,
}: {
	shopId: string;
	variant: PickedVariant;
	/** A preset, e.g. the stock page's "record a receipt" with a dated note. */
	defaults?: Partial<MovementFormState>;
	/** Absent when the drawer was opened on one variant from the editor. */
	onChangeVariant: (() => void) | null;
	/** With the variant as the ledger left it. */
	onSaved: (variant: VariantDoc) => void;
	onCancel: () => void;
}) {
	const currencyCode = useCurrencyCode();
	const t = useTranslations("Stock");
	const tRoot = useTranslations();
	const recordMovement = useRecordMovement(shopId);
	// The counters the form is checked against; refreshed when the ledger
	// says they moved while the seller was typing.
	const [levels, setLevels] = useState({
		stockOnHand: variant.stockOnHand,
		stockReserved: variant.stockReserved,
	});
	const { stockOnHand, stockReserved } = levels;
	// Read at validation time, so the refreshed counters apply at once.
	const levelsRef = useRef(levels);
	levelsRef.current = levels;
	const resolver: Resolver<MovementFormState> = (values, context, options) =>
		zodResolver(movementFormSchema(levelsRef.current))(
			values,
			context,
			options,
		);
	const initialType = defaults?.type ?? emptyMovementForm.type;
	const {
		control,
		formState,
		getValues,
		handleSubmit,
		register,
		setError,
		setValue,
		trigger,
	} = useForm<MovementFormState>({
		resolver,
		defaultValues: {
			...emptyMovementForm,
			...defaults,
			amount:
				defaults?.amount ??
				(initialType === "adjustment" ? String(variant.stockOnHand) : ""),
		},
		mode: "onChange",
	});

	const type = useWatch({ control, name: "type" });
	const amount = useWatch({ control, name: "amount" });
	const parsed = parseAmount(amount);
	const delta =
		parsed === null ? null : movementDelta(type, parsed, stockOnHand);
	const after = delta === null ? null : stockOnHand + delta;
	const amountError = formState.errors.amount?.message;

	const changeType = (next: MovementFormState["type"]) => {
		const { type: from, amount: current } = getValues();
		setValue("amount", amountAfterTypeChange(from, next, current, stockOnHand));
		setValue("type", next, { shouldValidate: true, shouldDirty: true });
	};

	const onValid = async (values: MovementFormState) => {
		const quantity = movementDelta(
			values.type,
			parseAmount(values.amount) ?? 0,
			stockOnHand,
		);
		const cost = parseAmount(values.unitCost);
		try {
			const { variant: saved } = await recordMovement.mutateAsync({
				variantId: variant.id,
				input: {
					type: values.type,
					quantity,
					...(values.type === "receipt" && cost !== null
						? { unitCost: cost }
						: {}),
					...(values.note.trim() ? { note: values.note.trim() } : {}),
					// A correction is absolute: it lands only on the stock it
					// was computed from.
					...(values.type === "adjustment"
						? { expectedStockOnHand: stockOnHand }
						: {}),
				},
			});
			onSaved(saved);
		} catch (error) {
			if (
				error instanceof ApiError &&
				error.code === ERROR_CODES.stockCountStale
			) {
				// A sale or another member moved the stock: show the new figure
				// and let the seller decide again, from it.
				const fresh = await shopApi.variant(variant.id).catch(() => null);
				if (fresh) {
					setLevels({
						stockOnHand: fresh.stockOnHand,
						stockReserved: fresh.stockReserved,
					});
					setError("root", {
						message: t("staleStock", { count: fresh.stockOnHand }),
					});
					void trigger("amount");
					return;
				}
			}
			// The ledger refused the write — a race, or units already reserved.
			// Its answer is the truth, so it is shown instead of being retried.
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	};

	return (
		<form onSubmit={handleSubmit(onValid)} className="space-y-5" noValidate>
			<div className="rounded-lg bg-canvas p-3">
				<p className="font-semibold text-ink">{variant.productTitle}</p>
				<p className="text-ink-muted text-sm">
					{variant.label} ·{" "}
					{variant.lowStockThreshold == null
						? t("currentStock", { count: stockOnHand })
						: t("currentStockWithAlert", {
								count: stockOnHand,
								threshold: variant.lowStockThreshold,
							})}
				</p>
				{stockReserved > 0 && (
					<p className="text-ink-muted text-sm">
						{t("reservedForOrders", {
							count: stockReserved,
							available: Math.max(0, stockOnHand - stockReserved),
						})}
					</p>
				)}
				{onChangeVariant && (
					<button
						type="button"
						onClick={onChangeVariant}
						className="mt-1 text-[var(--shop-accent-text,var(--c-brand))] text-xs hover:underline"
					>
						{t("changeVariant")}
					</button>
				)}
			</div>

			{!variant.trackInventory && (
				<p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800 text-xs">
					{t("trackingNote")}
				</p>
			)}

			<MovementTypePicker value={type} onChange={changeType} />
			{type === "return" && (
				<p className="rounded-lg bg-canvas px-3 py-2 text-ink-muted text-xs">
					{t("returnNote")}
				</p>
			)}

			<div className="space-y-1.5">
				<Label htmlFor="stock-amount">{t(`types.${type}.amountLabel`)}</Label>
				<Input id="stock-amount" inputMode="numeric" {...register("amount")} />
				{amountError ? (
					<p className="text-bad-ink text-xs">
						{t(amountError, { reserved: stockReserved })}
					</p>
				) : (
					type === "adjustment" &&
					delta !== null &&
					delta !== 0 && (
						<p className="text-ink-muted text-xs">
							{t("correctionGap", {
								delta: delta > 0 ? `+${delta}` : `${delta}`,
							})}
						</p>
					)
				)}
			</div>

			{type === "receipt" && (
				<div className="space-y-1.5">
					<Label htmlFor="stock-cost">{t("unitCost")}</Label>
					<Input
						id="stock-cost"
						inputMode="numeric"
						placeholder={currencyCode}
						{...register("unitCost")}
					/>
				</div>
			)}

			<div className="space-y-1.5">
				<Label htmlFor="stock-note">{t("note")}</Label>
				<Input
					id="stock-note"
					maxLength={NOTE_MAX}
					placeholder={t("notePlaceholder")}
					{...register("note")}
				/>
			</div>

			<div className="flex items-center justify-between rounded-lg border border-line p-3 text-sm">
				<span className="text-ink-muted">{t("stockAfter")}</span>
				<span
					className={cn(
						"font-bold",
						after !== null && after < 0 ? "text-bad-ink" : "text-ink",
					)}
				>
					{stockOnHand} → {after ?? "—"}
				</span>
			</div>

			{formState.errors.root?.message && (
				<p
					role="alert"
					className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
				>
					{formState.errors.root.message}
				</p>
			)}

			{/* Kept in reach at the bottom of the sheet while the form scrolls. */}
			<div className="-mx-5 -mb-5 sticky bottom-0 flex gap-2 border-line border-t bg-background px-5 py-3">
				<Button
					type="button"
					variant="outline"
					className="flex-1"
					onClick={onCancel}
				>
					{t("cancel")}
				</Button>
				<Button
					type="submit"
					disabled={!formState.isValid || recordMovement.isPending}
					className="flex-1 bg-[var(--shop-accent,var(--c-brand-fill))] text-[var(--shop-on-accent,#FFFFFF)] hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
				>
					{recordMovement.isPending && (
						<LoaderCircle
							aria-hidden="true"
							className="mr-2 h-4 w-4 animate-spin"
						/>
					)}
					{delta !== null && delta !== 0
						? t("saveWithDelta", {
								delta: delta > 0 ? `+${delta}` : `${delta}`,
							})
						: t("save")}
				</Button>
			</div>
		</form>
	);
}
