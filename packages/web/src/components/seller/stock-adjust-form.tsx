"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useRecordMovement } from "~/hooks/use-record-movement";
import { resolveErrorMessage } from "~/lib/apiError";
import { parseAmount } from "~/lib/product-form";
import {
	emptyMovementForm,
	type MovementFormState,
	movementDelta,
	movementFormSchema,
	NOTE_MAX,
} from "~/lib/stock";
import { cn } from "~/lib/utils";
import { MovementTypePicker } from "./movement-type-picker";
import type { PickedVariant } from "./variant-picker";

export function StockAdjustForm({
	shopId,
	variant,
	onChangeVariant,
	onSaved,
	onCancel,
}: {
	shopId: string;
	variant: PickedVariant;
	/** Absent when the drawer was opened on one variant from the editor. */
	onChangeVariant: (() => void) | null;
	onSaved: () => void;
	onCancel: () => void;
}) {
	const t = useTranslations("Stock");
	const tRoot = useTranslations();
	const recordMovement = useRecordMovement(shopId);
	const resolver = useMemo(
		() => zodResolver(movementFormSchema(variant.stockOnHand)),
		[variant.stockOnHand],
	);
	const { control, formState, handleSubmit, register, setError, setValue } =
		useForm<MovementFormState>({
			resolver,
			defaultValues: emptyMovementForm,
			mode: "onChange",
		});

	const type = useWatch({ control, name: "type" });
	const amount = useWatch({ control, name: "amount" });
	const parsed = parseAmount(amount);
	const delta =
		parsed === null ? null : movementDelta(type, parsed, variant.stockOnHand);
	const after = delta === null ? null : variant.stockOnHand + delta;
	const amountError = formState.errors.amount?.message;

	const onValid = async (values: MovementFormState) => {
		const quantity = movementDelta(
			values.type,
			parseAmount(values.amount) ?? 0,
			variant.stockOnHand,
		);
		const cost = parseAmount(values.unitCost);
		try {
			await recordMovement.mutateAsync({
				variantId: variant.id,
				input: {
					type: values.type,
					quantity,
					...(values.type === "receipt" && cost !== null
						? { unitCost: cost }
						: {}),
					...(values.note.trim() ? { note: values.note.trim() } : {}),
				},
			});
			onSaved();
		} catch (error) {
			// The ledger refused the write — a race, or units already reserved.
			// Its answer is the truth, so it is shown instead of being retried.
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	};

	return (
		<form onSubmit={handleSubmit(onValid)} className="space-y-5" noValidate>
			<div className="rounded-lg bg-[#F8FAFC] p-3">
				<p className="font-semibold text-[#0F172A]">{variant.productTitle}</p>
				<p className="text-[#64748B] text-sm">
					{variant.label} ·{" "}
					{variant.lowStockThreshold === null
						? t("currentStock", { count: variant.stockOnHand })
						: t("currentStockWithAlert", {
								count: variant.stockOnHand,
								threshold: variant.lowStockThreshold,
							})}
				</p>
				{onChangeVariant && (
					<button
						type="button"
						onClick={onChangeVariant}
						className="mt-1 text-[#1E40AF] text-xs hover:underline"
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

			<MovementTypePicker
				value={type}
				onChange={(next) =>
					setValue("type", next, { shouldValidate: true, shouldDirty: true })
				}
			/>

			<div className="space-y-1.5">
				<Label htmlFor="stock-amount">{t(`types.${type}.amountLabel`)}</Label>
				<Input id="stock-amount" inputMode="numeric" {...register("amount")} />
				{amountError && (
					<p className="text-[#991b1b] text-xs">{t(amountError)}</p>
				)}
			</div>

			{type === "receipt" && (
				<div className="space-y-1.5">
					<Label htmlFor="stock-cost">{t("unitCost")}</Label>
					<Input
						id="stock-cost"
						inputMode="numeric"
						placeholder="XAF"
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

			<div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] p-3 text-sm">
				<span className="text-[#64748B]">{t("stockAfter")}</span>
				<span
					className={cn(
						"font-bold",
						after !== null && after < 0 ? "text-[#991b1b]" : "text-[#0F172A]",
					)}
				>
					{variant.stockOnHand} → {after ?? "—"}
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

			<div className="flex gap-2">
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
					className="flex-1 bg-[#1E40AF] hover:bg-[#1E3A8A]"
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
