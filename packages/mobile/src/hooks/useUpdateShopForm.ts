import { zodResolver } from "@hookform/resolvers/zod";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAlert } from "@/src/contexts/AlertContext";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type { Place } from "@/src/lib/places";
import type { MyShop } from "@/src/types/api";
import { useUpdateShop } from "./useShops";

const shopProfileSchema = z.object({
	name: z.string().trim().min(2).max(60),
	description: z.string().max(1000),
	city: z.custom<Place | null>(),
	categories: z.array(z.object({ id: z.string(), name: z.string() })).max(5),
	phone: z.string().trim().max(30),
	whatsapp: z.string().trim().max(30),
	email: z.union([z.literal(""), z.string().trim().email()]),
});
export type ShopProfileFormValues = z.infer<typeof shopProfileSchema>;

function defaultValues(shop: MyShop): ShopProfileFormValues {
	return {
		name: shop.name,
		description: shop.description ?? "",
		city: shop.location.city
			? {
					name: shop.location.city,
					region: shop.location.region ?? "",
					country: shop.location.country ?? undefined,
					countryCode: shop.location.countryCode ?? undefined,
					source: "custom",
				}
			: null,
		categories: shop.categories.map((cat) => ({ id: cat.id, name: cat.name })),
		phone: shop.contact.phone ?? "",
		whatsapp: shop.contact.whatsapp ?? "",
		email: shop.contact.email ?? "",
	};
}

/**
 * Owns the profile+contacts form: name, description, city, categories and
 * the three contact fields save together through one `PATCH`, matching the
 * same manager-or-owner access `can(role, "settings.edit")` grants (unlike
 * the address and close-shop forms, this one is not owner-gated).
 */
export function useUpdateShopForm(shop: MyShop) {
	const { t } = useTranslation();
	const { showSuccess, showError } = useAlert();
	const updateShop = useUpdateShop(shop.id);
	const submittingRef = useRef(false);

	const form = useForm<ShopProfileFormValues>({
		resolver: zodResolver(shopProfileSchema),
		mode: "onChange",
		defaultValues: defaultValues(shop),
	});

	const description = form.watch("description");
	const categories = form.watch("categories");

	const submit = form.handleSubmit((values) => {
		if (submittingRef.current || updateShop.isPending) return;
		submittingRef.current = true;
		updateShop.mutate(
			{
				name: values.name.trim(),
				description: values.description.trim() || null,
				location: {
					city: values.city?.name || null,
					region: values.city?.region || null,
					country: values.city?.country || null,
					countryCode: values.city?.countryCode || null,
				},
				categories: values.categories.map((cat) => cat.id),
				contact: {
					phone: values.phone.trim() || null,
					whatsapp: values.whatsapp.trim() || null,
					email: values.email.trim() || null,
				},
			},
			{
				onSuccess: () => {
					submittingRef.current = false;
					showSuccess(t("shop.savedTitle"), t("shop.savedMessage"));
				},
				onError: (error) => {
					submittingRef.current = false;
					showError(t("shop.saveError"), resolveErrorMessage(error, t));
				},
			},
		);
	});

	return {
		form,
		description,
		categories,
		submit,
		isPending: updateShop.isPending,
	};
}
