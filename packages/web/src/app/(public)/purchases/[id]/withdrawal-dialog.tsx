"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useFieldArray, useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useRequestWithdrawal } from "~/hooks/use-order-actions";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate } from "~/lib/order-money";
import type { OrderView } from "~/types/order";
import {
	type WithdrawalInput,
	type WithdrawalValues,
	windowCountdown,
	withdrawalPayload,
	withdrawalSchema,
} from "../purchase-view";
import { ActionDialog, type DialogControl } from "./action-dialog";

/**
 * The window's state in words. Whether the button exists is the action
 * bar's business (`availableActions` with the same `now`), so the countdown
 * reaching zero and the button disappearing happen on the same tick.
 */
export function WithdrawalWindow({
	order,
	now,
}: {
	order: OrderView;
	now: Date;
}) {
	const t = useTranslations("Purchases");
	const locale = useLocale() === "en" ? "en" : "fr";
	const until = order.deadlines.withdrawalUntil;
	if (until === null) return null;

	if (order.returnCaseNumber) {
		return (
			<p className="rounded-xl bg-[#EFF6FF] p-3 text-[#1E40AF] text-sm">
				{t("withdrawalCaseOpen", { number: order.returnCaseNumber })}
			</p>
		);
	}
	const left = windowCountdown(until, now);
	if (!left) {
		return <p className="text-[#64748B] text-sm">{t("returnWindowClosed")}</p>;
	}
	return (
		<div className="text-sm">
			<p className="font-medium text-[#0F172A]">
				{t("withdrawalCountdown", left)}
			</p>
			<p className="text-[#64748B]">
				{t("returnWindow", { date: formatOrderDate(until, locale) })}
			</p>
		</div>
	);
}

export function WithdrawalDialog({
	order,
	...control
}: DialogControl & { order: OrderView }) {
	const t = useTranslations("Purchases");
	const tRoot = useTranslations();
	const withdrawal = useRequestWithdrawal({ orderId: order.id });
	const {
		control: formControl,
		formState,
		handleSubmit,
		register,
		setError,
	} = useForm<WithdrawalInput, unknown, WithdrawalValues>({
		resolver: zodResolver(withdrawalSchema),
		defaultValues: {
			items: order.items.map((item) => ({
				orderItemId: item.id,
				quantity: 0,
				max: item.quantity,
			})),
			reasonText: "",
		},
	});
	const { fields } = useFieldArray({ control: formControl, name: "items" });

	const onSubmit = handleSubmit(async (values) => {
		try {
			await withdrawal.mutateAsync(withdrawalPayload(values));
			control.onOpenChange(false);
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	});

	return (
		<ActionDialog {...control} title={t("returnItem")}>
			<form onSubmit={onSubmit} className="space-y-4" noValidate>
				<fieldset className="space-y-3">
					<legend className="mb-2 font-medium text-sm">
						{t("withdrawalItems")}
					</legend>
					{fields.map((field, index) => {
						const item = order.items[index];
						return (
							<div key={field.id} className="flex items-center gap-3">
								<label
									htmlFor={`withdrawal-${field.id}`}
									className="min-w-0 flex-1 text-sm"
								>
									<span className="block truncate font-medium">
										{item.title}
										{item.variantLabel ? ` — ${item.variantLabel}` : ""}
									</span>
									<span className="text-[#64748B] text-xs">
										{t("withdrawalQuantity", { max: field.max })}
									</span>
								</label>
								<Input
									id={`withdrawal-${field.id}`}
									type="number"
									min={0}
									max={field.max}
									className="h-11 w-20"
									{...register(`items.${index}.quantity`)}
								/>
							</div>
						);
					})}
				</fieldset>
				{formState.errors.items && (
					<p className="text-red-700 text-sm">
						{t("withdrawalNothingSelected")}
					</p>
				)}

				<div className="space-y-1">
					<p className="font-medium text-sm">{t("withdrawalMethod")}</p>
					<p className="text-[#64748B] text-sm">{t("withdrawalMethodBody")}</p>
				</div>

				<div className="space-y-1.5">
					<label
						htmlFor="withdrawal-reason"
						className="block font-medium text-sm"
					>
						{t("withdrawalReason")}
					</label>
					<Textarea
						id="withdrawal-reason"
						rows={3}
						{...register("reasonText")}
					/>
				</div>

				{formState.errors.root?.message && (
					<p role="alert" className="text-red-700 text-sm">
						{formState.errors.root.message}
					</p>
				)}
				<div className="flex justify-end">
					<Button
						type="submit"
						className="min-h-11"
						disabled={withdrawal.isPending}
					>
						{t("withdrawalSubmit")}
					</Button>
				</div>
			</form>
		</ActionDialog>
	);
}
