"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { useSaveBusiness } from "~/hooks/use-verification";
import { resolveErrorMessage } from "~/lib/apiError";
import type { BusinessType } from "~/lib/verification";
import {
	BUSINESS_TYPES,
	type BusinessFormValues,
	businessSchema,
	normalizeBusinessValues,
} from "~/lib/verification-business";

function isBusinessType(value: string): value is BusinessType {
	return (BUSINESS_TYPES as readonly string[]).includes(value);
}

export interface BusinessFormProps {
	shopId: string;
	requestId: string;
	defaultValues: BusinessFormValues;
	onSaved: () => void;
}

/** The business-details half of `/seller/verification/business`. Saving
 * (not submitting for review) is what this form does — the review submit
 * button lives above the document slots, gated on `canSubmit`. */
export function BusinessForm({
	shopId,
	requestId,
	defaultValues,
	onSaved,
}: BusinessFormProps) {
	const t = useTranslations("Verification.business");
	const tRoot = useTranslations();
	const saveBusiness = useSaveBusiness(shopId);
	const {
		register,
		control,
		handleSubmit,
		setError,
		formState: { errors, isSubmitting },
	} = useForm<BusinessFormValues>({
		resolver: zodResolver(businessSchema),
		defaultValues,
	});
	const businessType = useWatch({ control, name: "businessType" });
	const isEntreprenant = businessType === "entreprenant";

	const onValid = async (values: BusinessFormValues) => {
		const normalized = normalizeBusinessValues(values);
		try {
			await saveBusiness.mutateAsync({
				requestId,
				business: {
					...normalized,
					tradeName: normalized.tradeName || null,
					rccmNumber: normalized.rccmNumber || null,
					entreprenantDeclarationNumber:
						normalized.entreprenantDeclarationNumber || null,
				},
			});
			onSaved();
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	};

	return (
		<form onSubmit={handleSubmit(onValid)} className="space-y-4" noValidate>
			{errors.root?.message && (
				<p
					role="alert"
					className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
				>
					{errors.root.message}
				</p>
			)}

			<div className="space-y-1">
				<Label htmlFor="businessType">{t("businessType")}</Label>
				<Controller
					control={control}
					name="businessType"
					render={({ field }) => (
						<Select
							value={field.value}
							onValueChange={(value) => {
								if (isBusinessType(value)) field.onChange(value);
							}}
						>
							<SelectTrigger id="businessType">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{BUSINESS_TYPES.map((value) => (
									<SelectItem key={value} value={value}>
										{t(`businessTypeOption.${value}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				/>
			</div>

			<div className="space-y-1">
				<Label htmlFor="legalName">{t("legalName")}</Label>
				<Input id="legalName" {...register("legalName")} />
				{errors.legalName && (
					<p className="text-red-600 text-xs">{errors.legalName.message}</p>
				)}
			</div>

			<div className="space-y-1">
				<Label htmlFor="tradeName">{t("tradeName")}</Label>
				<Input id="tradeName" {...register("tradeName")} />
			</div>

			{isEntreprenant ? (
				<div className="space-y-1">
					<Label htmlFor="entreprenantDeclarationNumber">
						{t("entreprenantDeclarationNumber")}
					</Label>
					<Input
						id="entreprenantDeclarationNumber"
						{...register("entreprenantDeclarationNumber")}
					/>
					{errors.entreprenantDeclarationNumber && (
						<p className="text-red-600 text-xs">
							{errors.entreprenantDeclarationNumber.message}
						</p>
					)}
				</div>
			) : (
				<div className="space-y-1">
					<Label htmlFor="rccmNumber">{t("rccmNumber")}</Label>
					<Input id="rccmNumber" {...register("rccmNumber")} />
					{errors.rccmNumber && (
						<p className="text-red-600 text-xs">{errors.rccmNumber.message}</p>
					)}
				</div>
			)}

			<div className="space-y-1">
				<Label htmlFor="niu">{t("niu")}</Label>
				<Input id="niu" {...register("niu")} />
				{errors.niu && (
					<p className="text-red-600 text-xs">{errors.niu.message}</p>
				)}
			</div>

			<div className="space-y-1">
				<Label htmlFor="registeredAddress">{t("registeredAddress")}</Label>
				<Input id="registeredAddress" {...register("registeredAddress")} />
				{errors.registeredAddress && (
					<p className="text-red-600 text-xs">
						{errors.registeredAddress.message}
					</p>
				)}
			</div>

			<div className="space-y-1">
				<Label htmlFor="city">{t("city")}</Label>
				<Input id="city" {...register("city")} />
				{errors.city && (
					<p className="text-red-600 text-xs">{errors.city.message}</p>
				)}
			</div>

			<div className="space-y-1">
				<Label htmlFor="legalRepresentativeName">
					{t("legalRepresentativeName")}
				</Label>
				<Input
					id="legalRepresentativeName"
					{...register("legalRepresentativeName")}
				/>
				{errors.legalRepresentativeName && (
					<p className="text-red-600 text-xs">
						{errors.legalRepresentativeName.message}
					</p>
				)}
			</div>

			<div className="flex items-center gap-2">
				<input
					id="legalRepresentativeIsOwner"
					type="checkbox"
					className="h-4 w-4"
					{...register("legalRepresentativeIsOwner")}
				/>
				<Label htmlFor="legalRepresentativeIsOwner">
					{t("legalRepresentativeIsOwner")}
				</Label>
			</div>

			<Button type="submit" disabled={isSubmitting || saveBusiness.isPending}>
				{saveBusiness.isPending ? t("saving") : t("save")}
			</Button>
		</form>
	);
}
