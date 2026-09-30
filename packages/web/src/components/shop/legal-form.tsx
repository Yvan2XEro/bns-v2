"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
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
import { useUpdateShop } from "~/hooks/use-shop-settings";
import { useShopVerification } from "~/hooks/use-verification";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	businessTypeLabelKey,
	type LegalFormValues,
	legalFormDefaults,
	legalFormSchema,
	toLegalUpdateInput,
} from "~/lib/shop-legal";
import type { BusinessType } from "~/lib/verification";
import type { MyShop } from "~/types";

const BUSINESS_TYPES: readonly BusinessType[] = [
	"entreprenant",
	"sole_trader",
	"company",
	"cooperative",
];

export function LegalForm({ shop }: { shop: MyShop }) {
	const t = useTranslations("ShopManage");
	const tShop = useTranslations("Shop");
	const tRoot = useTranslations();
	const router = useRouter();
	const updateShop = useUpdateShop(shop.id);
	const verification = useShopVerification(shop.id);
	// Fails closed: until the level is known, the form stays read-only rather
	// than flashing editable and locking a moment later.
	const readOnly = verification.data
		? verification.data.capabilities.effectiveLevel >= 3
		: true;

	const { control, formState, handleSubmit, register, setError } =
		useForm<LegalFormValues>({
			resolver: zodResolver(legalFormSchema),
			mode: "onChange",
			defaultValues: legalFormDefaults(shop.legal),
		});

	const onSubmit = handleSubmit(async (values) => {
		try {
			await updateShop.mutateAsync({ legal: toLegalUpdateInput(values) });
			router.refresh();
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	});

	return (
		<form onSubmit={onSubmit} className="space-y-4" noValidate>
			<p className="text-[#64748B] text-sm">
				{readOnly ? t("legalLockedHint") : t("legalHint")}
			</p>
			<div className="space-y-1.5">
				<Label htmlFor="legal-business-type">{tShop("businessType")}</Label>
				<Controller
					control={control}
					name="businessType"
					render={({ field }) => (
						<Select
							value={field.value || "none"}
							onValueChange={(value) =>
								field.onChange(value === "none" ? "" : value)
							}
							disabled={readOnly}
						>
							<SelectTrigger
								id="legal-business-type"
								className="h-9 rounded-lg text-sm"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">{t("legalNone")}</SelectItem>
								{BUSINESS_TYPES.map((type) => (
									<SelectItem key={type} value={type}>
										{tShop(businessTypeLabelKey(type))}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="legal-name">{tShop("legalName")}</Label>
				<Input id="legal-name" disabled={readOnly} {...register("legalName")} />
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="legal-rccm">{tShop("rccm")}</Label>
				<Input
					id="legal-rccm"
					disabled={readOnly}
					{...register("rccmNumber")}
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="legal-niu">{tShop("niu")}</Label>
				<Input id="legal-niu" disabled={readOnly} {...register("niu")} />
			</div>
			{updateShop.isSuccess && (
				<p className="text-[#166534] text-sm">{t("saved")}</p>
			)}
			{formState.errors.root?.message && (
				<p className="text-red-700 text-sm">{formState.errors.root.message}</p>
			)}
			{!readOnly && (
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
