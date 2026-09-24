"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useUpdateShop } from "~/hooks/use-shop-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import { type ShopContactsValues, shopContactsSchema } from "~/lib/shop-form";
import type { MyShop } from "~/types";

export function ContactsForm({ shop }: { shop: MyShop }) {
	const t = useTranslations("ShopManage");
	const tRoot = useTranslations();
	const router = useRouter();
	const updateShop = useUpdateShop(shop.id);

	const { formState, handleSubmit, register, setError } =
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
					phone: values.phone.trim() || null,
					whatsapp: values.whatsapp.trim() || null,
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
				<Input
					id="contact-phone"
					type="tel"
					placeholder="+237 6XX XX XX XX"
					{...register("phone")}
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="contact-whatsapp">{t("contactWhatsapp")}</Label>
				<Input
					id="contact-whatsapp"
					type="tel"
					placeholder="+237 6XX XX XX XX"
					{...register("whatsapp")}
				/>
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
