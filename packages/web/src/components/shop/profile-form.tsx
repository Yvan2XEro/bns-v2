"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Controller, useForm, useWatch } from "react-hook-form";
import { LocationField } from "~/components/location/location-field";
import {
	type CategoryChipOption,
	CategoryChips,
} from "~/components/shop/category-chips";
import { MediaField } from "~/components/shop/media-field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { useUpdateShop } from "~/hooks/use-shop-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	placeOfShopLocation,
	SHOP_CATEGORIES_MAX,
	SHOP_DESCRIPTION_MAX,
	SHOP_NAME_MAX,
	type ShopProfileValues,
	shopLocationOf,
	shopProfileSchema,
} from "~/lib/shop-form";
import type { Category, MyShop } from "~/types";
import { ShopInitials } from "./shop-initials";

export function ProfileForm({
	shop,
	categories,
}: {
	shop: MyShop;
	categories: Category[];
}) {
	const t = useTranslations("ShopManage");
	const tRoot = useTranslations();
	const router = useRouter();
	const updateShop = useUpdateShop(shop.id);

	const { control, formState, handleSubmit, register, setError } =
		useForm<ShopProfileValues>({
			resolver: zodResolver(shopProfileSchema),
			mode: "onChange",
			defaultValues: {
				name: shop.name,
				description: shop.description ?? "",
				city: placeOfShopLocation(shop.location),
				categories: shop.categories.map((category) => category.id),
				logo: { id: shop.logo?.id ?? null, url: shop.logo?.url ?? null },
				banner: {
					id: shop.banner?.id ?? null,
					url: shop.banner?.url ?? null,
				},
			},
		});

	const description = useWatch({ control, name: "description" });
	const name = useWatch({ control, name: "name" });
	const selected = useWatch({ control, name: "categories" });

	// Categories already on the shop stay selectable even if they are not roots.
	const options: CategoryChipOption[] = [
		...categories,
		...shop.categories.filter(
			(category) => !categories.some((root) => root.id === category.id),
		),
	];

	const onSubmit = handleSubmit(async (values) => {
		try {
			await updateShop.mutateAsync({
				name: values.name.trim(),
				description: values.description.trim() || null,
				logo: values.logo.id,
				banner: values.banner.id,
				location: shopLocationOf(values.city),
				categories: values.categories,
			});
			router.refresh();
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	});

	return (
		<form onSubmit={onSubmit} className="space-y-6" noValidate>
			<Controller
				control={control}
				name="logo"
				render={({ field }) => (
					<MediaField
						label={t("logo")}
						hint={t("logoHint")}
						previewUrl={field.value.url}
						shape="square"
						placeholder={
							<ShopInitials
								name={name || shop.name}
								className="h-full w-full text-2xl"
							/>
						}
						onUploaded={(id, url) => field.onChange({ id, url })}
						onRemove={() => field.onChange({ id: null, url: null })}
					/>
				)}
			/>
			<Controller
				control={control}
				name="banner"
				render={({ field }) => (
					<MediaField
						label={t("banner")}
						hint={t("bannerHint")}
						previewUrl={field.value.url}
						shape="banner"
						placeholder={
							<div className="pattern-dots-light h-full w-full bg-[#1E40AF]" />
						}
						onUploaded={(id, url) => field.onChange({ id, url })}
						onRemove={() => field.onChange({ id: null, url: null })}
					/>
				)}
			/>
			<div className="space-y-1.5">
				<Label htmlFor="shop-name">{t("name")}</Label>
				<Input
					id="shop-name"
					maxLength={SHOP_NAME_MAX}
					aria-invalid={Boolean(formState.errors.name)}
					{...register("name")}
				/>
				<p
					className={
						formState.errors.name
							? "text-red-600 text-xs"
							: "text-[#94A3B8] text-xs"
					}
				>
					{t("nameHint")}
				</p>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="shop-description">{t("description")}</Label>
				<Textarea
					id="shop-description"
					rows={4}
					maxLength={SHOP_DESCRIPTION_MAX}
					{...register("description")}
				/>
				<p className="text-[#94A3B8] text-xs">
					{description.length} / {SHOP_DESCRIPTION_MAX}
				</p>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="shop-city">{t("city")}</Label>
				<Controller
					control={control}
					name="city"
					render={({ field }) => (
						<LocationField
							id="shop-city"
							value={field.value}
							onChange={field.onChange}
						/>
					)}
				/>
			</div>
			<fieldset className="space-y-2">
				<legend className="mb-1.5 font-medium text-[#0F172A] text-sm">
					{t("categories", { count: selected.length })}
				</legend>
				<Controller
					control={control}
					name="categories"
					render={({ field }) => (
						<CategoryChips
							categories={options}
							selected={field.value}
							onChange={field.onChange}
							max={SHOP_CATEGORIES_MAX}
						/>
					)}
				/>
				<p className="text-[#94A3B8] text-xs">{t("categoriesHint")}</p>
			</fieldset>
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
