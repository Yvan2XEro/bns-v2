"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FieldError as RhfFieldError, useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { useSaveOrderSettings } from "~/hooks/use-order-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatXaf } from "~/lib/order-money";
import {
	MAX_ETA_TEXT,
	MAX_SALES_TERMS,
	type OrderSettingsFormValues,
	orderSettingsSchema,
	toFormValues,
	toOrderSettingsInput,
} from "~/lib/order-settings-form";
import type { OrderSettingsView } from "~/types/order";
import { useLocaleKey } from "../../billing/use-locale-key";
import { FieldError, Section, Toggle } from "./form-controls";
import { PickupFields } from "./pickup-fields";

export function OrderSettingsForm({
	shopId,
	view,
	canEdit,
}: {
	shopId: string;
	view: OrderSettingsView;
	canEdit: boolean;
}) {
	const t = useTranslations("Billing");
	const tRoot = useTranslations();
	const locale = useLocaleKey();
	const save = useSaveOrderSettings(shopId);
	const { formState, handleSubmit, register, reset, setError, watch } =
		useForm<OrderSettingsFormValues>({
			resolver: zodResolver(orderSettingsSchema),
			mode: "onChange",
			defaultValues: toFormValues(view),
		});
	const { errors } = formState;
	const sellerDelivery = watch("sellerDeliveryEnabled");
	const pickup = watch("pickupEnabled");

	const tooLong = (error: RhfFieldError | undefined, max: number) =>
		error ? t("tooLong", { max }) : null;

	const onSubmit = handleSubmit(async (values) => {
		try {
			reset(toFormValues(await save.mutateAsync(toOrderSettingsInput(values))));
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	});

	return (
		<form onSubmit={onSubmit} noValidate>
			<fieldset disabled={!canEdit || save.isPending} className="space-y-4">
				<Section title={t("paymentSection")}>
					<Toggle
						id="cod-enabled"
						label={t("codEnabled")}
						{...register("codEnabled")}
					/>
				</Section>

				<Section title={t("deliverySection")}>
					<Toggle
						id="seller-delivery"
						label={t("sellerDelivery")}
						{...register("sellerDeliveryEnabled")}
					/>
					{sellerDelivery && (
						<>
							<div className="space-y-1.5">
								<Label htmlFor="delivery-fee">{t("deliveryFee")}</Label>
								<Input
									id="delivery-fee"
									inputMode="numeric"
									className="h-11"
									placeholder={
										view.cityDefaultFee === null
											? undefined
											: formatXaf(view.cityDefaultFee, locale)
									}
									aria-invalid={Boolean(errors.deliveryFee)}
									aria-describedby="delivery-fee-hint"
									{...register("deliveryFee")}
								/>
								<p id="delivery-fee-hint" className="text-[#64748B] text-xs">
									{view.cityDefaultFee === null
										? t("deliveryFeeHintNoCity")
										: t("deliveryFeeHint", {
												fee: formatXaf(view.cityDefaultFee, locale),
											})}
								</p>
								<FieldError>
									{errors.deliveryFee && t("deliveryFeeInvalid")}
								</FieldError>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="delivery-eta">{t("etaText")}</Label>
								<Input
									id="delivery-eta"
									className="h-11"
									maxLength={MAX_ETA_TEXT}
									placeholder={t("etaTextPlaceholder")}
									aria-invalid={Boolean(errors.deliveryEtaText)}
									{...register("deliveryEtaText")}
								/>
								<FieldError>
									{tooLong(errors.deliveryEtaText, MAX_ETA_TEXT)}
								</FieldError>
							</div>
						</>
					)}
				</Section>

				<Section title={t("pickupSection")}>
					<Toggle
						id="pickup-enabled"
						label={t("pickupEnabled")}
						{...register("pickupEnabled")}
					/>
					{pickup && <PickupFields register={register} errors={errors} />}
				</Section>

				<Section title={t("termsSection")}>
					<Label htmlFor="sales-terms">{t("salesTermsExtra")}</Label>
					<Textarea
						id="sales-terms"
						rows={5}
						aria-invalid={Boolean(errors.salesTermsExtra)}
						aria-describedby="sales-terms-hint"
						{...register("salesTermsExtra")}
					/>
					<p id="sales-terms-hint" className="text-[#64748B] text-xs">
						{t("salesTermsHint")}
					</p>
					<FieldError>
						{tooLong(errors.salesTermsExtra, MAX_SALES_TERMS)}
					</FieldError>
				</Section>
			</fieldset>

			{canEdit && (
				<div className="mt-4 flex flex-wrap items-center gap-3">
					<Button
						type="submit"
						className="h-11"
						disabled={!formState.isDirty || save.isPending}
					>
						{save.isPending && <LoaderCircle className="animate-spin" />}
						{t("save")}
					</Button>
					{save.isSuccess && !formState.isDirty && (
						<output className="text-[#166534] text-sm">{t("saved")}</output>
					)}
					{errors.root?.message && (
						<p role="alert" className="text-red-700 text-sm">
							{errors.root.message}
						</p>
					)}
				</div>
			)}
		</form>
	);
}
