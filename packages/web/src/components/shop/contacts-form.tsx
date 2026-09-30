"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { PhoneInput } from "~/components/ui/phone-input";
import { useUpdateShop } from "~/hooks/use-shop-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type ShopContactsValues,
	shopContactsSchema,
	toNullablePhone,
} from "~/lib/shop-form";
import type { MyShop } from "~/types";

export function ContactsForm({ shop }: { shop: MyShop }) {
	const t = useTranslations("ShopManage");
	const tPhone = useTranslations("PhoneVerification");
	const tRoot = useTranslations();
	const router = useRouter();
	const updateShop = useUpdateShop(shop.id);

	const { control, formState, handleSubmit, register, setError } =
		useForm<ShopContactsValues>({
			resolver: zodResolver(shopContactsSchema),
			mode: "onChange",
			defaultValues: {
				phone: shop.contact.phone ?? "",
				whatsapp: shop.contact.whatsapp ?? "",
				email: shop.contact.email ?? "",
			},
		});

	const onSubmit = handleSubmit(async (values) => {
		try {
			await updateShop.mutateAsync({
				contact: {
					phone: toNullablePhone(values.phone),
					whatsapp: toNullablePhone(values.whatsapp),
					email: values.email.trim() || null,
				},
			});
			router.refresh();
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	});

	return (
		<form onSubmit={onSubmit} className="space-y-4" noValidate>
			<p className="text-[#64748B] text-sm">{t("contactsHint")}</p>
			<div className="space-y-1.5">
				<Label htmlFor="contact-phone">{t("contactPhone")}</Label>
				<Controller
					control={control}
					name="phone"
					render={({ field }) => (
						<PhoneInput
							id="contact-phone"
							placeholder={tPhone("phonePlaceholder")}
							aria-invalid={Boolean(formState.errors.phone)}
							value={field.value}
							onChange={field.onChange}
							onBlur={field.onBlur}
						/>
					)}
				/>
				{formState.errors.phone && (
					<p className="text-red-600 text-xs">{tPhone("phoneFormatInvalid")}</p>
				)}
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="contact-whatsapp">{t("contactWhatsapp")}</Label>
				<Controller
					control={control}
					name="whatsapp"
					render={({ field }) => (
						<PhoneInput
							id="contact-whatsapp"
							placeholder={tPhone("phonePlaceholder")}
							aria-invalid={Boolean(formState.errors.whatsapp)}
							value={field.value}
							onChange={field.onChange}
							onBlur={field.onBlur}
						/>
					)}
				/>
				{formState.errors.whatsapp && (
					<p className="text-red-600 text-xs">{tPhone("phoneFormatInvalid")}</p>
				)}
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="contact-email">{t("contactEmail")}</Label>
				<Input
					id="contact-email"
					type="email"
					aria-invalid={Boolean(formState.errors.email)}
					{...register("email")}
				/>
				{formState.errors.email?.message && (
					<p className="text-red-600 text-xs">{t("contactEmailInvalid")}</p>
				)}
			</div>
			{updateShop.isSuccess && (
				<p className="text-[#166534] text-sm">{t("saved")}</p>
			)}
			{formState.errors.root?.message && (
				<p className="text-red-700 text-sm">{formState.errors.root.message}</p>
			)}
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
		</form>
	);
}
