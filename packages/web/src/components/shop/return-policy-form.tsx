"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { useUpdateShop } from "~/hooks/use-shop-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type ReturnPolicyFormValues,
	returnPolicyFormDefaults,
	returnPolicyFormSchema,
	SHOP_RETURN_POLICY_MAX,
	toReturnPolicyInput,
} from "~/lib/shop-return-policy";
import type { MyShop } from "~/types";
import { type FormBarState, useReportFormBar } from "./form-bar";

/** The shop's default return policy, which new products start from. */
export function ReturnPolicyForm({
	shop,
	formId,
	readOnly = false,
	onStateChange,
}: {
	shop: MyShop;
	formId?: string;
	/** For a member without `settings.edit`, which the save would be refused. */
	readOnly?: boolean;
	onStateChange?: (state: FormBarState) => void;
}) {
	const t = useTranslations("ShopManage");
	const tRoot = useTranslations();
	const router = useRouter();
	const updateShop = useUpdateShop(shop.id);
	const { formState, handleSubmit, register, reset, setError, watch } =
		useForm<ReturnPolicyFormValues>({
			resolver: zodResolver(returnPolicyFormSchema),
			mode: "onChange",
			defaultValues: returnPolicyFormDefaults(shop.returnPolicy),
		});
	const length = watch("returnPolicy").trim().length;

	useReportFormBar(
		onStateChange,
		{
			dirty: formState.isDirty,
			canSave: formState.isValid && formState.isDirty && !readOnly,
			pending: updateShop.isPending,
		},
		() => reset(),
	);

	const onSubmit = handleSubmit(async (values) => {
		try {
			await updateShop.mutateAsync(toReturnPolicyInput(values));
			reset(values);
			router.refresh();
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	});

	return (
		<form id={formId} onSubmit={onSubmit} className="space-y-4" noValidate>
			<p className="text-[#64748B] text-sm">
				{readOnly ? t("returnPolicyReadOnly") : t("returnPolicyHint")}
			</p>
			<div className="space-y-1.5">
				<Label htmlFor="shop-return-policy">{t("returnPolicyLabel")}</Label>
				<Textarea
					id="shop-return-policy"
					rows={6}
					disabled={readOnly}
					placeholder={t("returnPolicyPlaceholder")}
					aria-invalid={Boolean(formState.errors.returnPolicy)}
					aria-describedby="shop-return-policy-count"
					{...register("returnPolicy")}
				/>
				<p
					id="shop-return-policy-count"
					className={`text-xs ${formState.errors.returnPolicy ? "text-red-700" : "text-[#64748B]"}`}
				>
					{formState.errors.returnPolicy
						? t("returnPolicyTooLong", { max: SHOP_RETURN_POLICY_MAX })
						: t("returnPolicyCount", {
								count: length,
								max: SHOP_RETURN_POLICY_MAX,
							})}
				</p>
			</div>
			{updateShop.isSuccess && (
				<p className="text-[#166534] text-sm">{t("saved")}</p>
			)}
			{formState.errors.root?.message && (
				<p className="text-red-700 text-sm">{formState.errors.root.message}</p>
			)}
			{!formId && !readOnly && (
				<Button
					type="submit"
					disabled={!formState.isValid || updateShop.isPending}
					className="bg-[#1E40AF] hover:bg-[#1E3A8A]"
				>
					{updateShop.isPending && (
						<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
					)}
					{t("save")}
				</Button>
			)}
		</form>
	);
}
