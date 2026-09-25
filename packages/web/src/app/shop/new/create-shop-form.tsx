"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Controller, useForm, useWatch } from "react-hook-form";
import { CategoryChips } from "~/components/shop/category-chips";
import { HandleInput } from "~/components/shop/handle-input";
import { PhoneRequirement } from "~/components/shop/phone-requirement";
import { ShopPreviewCard } from "~/components/shop/shop-preview-card";
import { Button } from "~/components/ui/button";
import { CitySelect } from "~/components/ui/city-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useCreateShop } from "~/hooks/use-create-shop";
import { useHandleAvailability } from "~/hooks/use-handle-availability";
import { usePhoneStatus } from "~/hooks/use-phone-status";
import { ERROR_CODES, resolveErrorMessage } from "~/lib/apiError";
import {
	type CreateShopValues,
	createShopSchema,
	SHOP_CATEGORIES_MAX,
	SHOP_NAME_MAX,
} from "~/lib/shop-form";
import { slugifyHandle } from "~/lib/shop-handle";
import type { Category } from "~/types";

const HANDLE_ERROR_CODES: string[] = [
	ERROR_CODES.shopHandleTaken,
	ERROR_CODES.shopHandleReserved,
	ERROR_CODES.shopHandleInvalid,
];

export function CreateShopForm({ categories }: { categories: Category[] }) {
	const t = useTranslations("ShopCreate");
	const tRoot = useTranslations();
	const router = useRouter();
	const createShop = useCreateShop();
	const { data: phoneStatus } = usePhoneStatus();

	const {
		control,
		formState,
		handleSubmit,
		getFieldState,
		register,
		setError,
		setValue,
	} = useForm<CreateShopValues>({
		resolver: zodResolver(createShopSchema),
		mode: "onChange",
		defaultValues: { name: "", handle: "", city: "", categories: [] },
	});

	const name = useWatch({ control, name: "name" });
	const handle = useWatch({ control, name: "handle" });
	const selected = useWatch({ control, name: "categories" });
	const { status } = useHandleAvailability(handle);

	const phoneVerified = phoneStatus?.isPhoneVerified === true;
	const canSubmit =
		formState.isValid &&
		status === "available" &&
		phoneVerified &&
		!createShop.isPending;

	const onSubmit = handleSubmit(async (values) => {
		try {
			await createShop.mutateAsync({
				handle: values.handle,
				name: values.name.trim(),
				...(values.city ? { city: values.city } : {}),
				...(values.categories.length > 0
					? { categories: values.categories }
					: {}),
			});
			router.push("/seller");
			router.refresh();
		} catch (error) {
			// The handle was free when it was checked and is not any more, or the
			// phone gate moved under us: put the server's own answer on the field.
			const code =
				error && typeof error === "object" && "code" in error
					? String((error as { code: unknown }).code)
					: "";
			const message = resolveErrorMessage(error, tRoot);
			setError(HANDLE_ERROR_CODES.includes(code) ? "handle" : "root", {
				message,
			});
		}
	});

	return (
		<form onSubmit={onSubmit} className="space-y-6" noValidate>
			<ShopPreviewCard name={name} />

			<div className="space-y-2">
				<Label htmlFor="shop-name">{t("name")}</Label>
				<Input
					id="shop-name"
					maxLength={SHOP_NAME_MAX}
					placeholder={t("namePlaceholder")}
					aria-invalid={Boolean(formState.errors.name)}
					{...register("name", {
						onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
							// The handle follows the name until the seller edits it.
							if (getFieldState("handle").isDirty) return;
							setValue("handle", slugifyHandle(event.target.value), {
								shouldValidate: true,
							});
						},
					})}
				/>
				<p
					className={
						formState.errors.name
							? "text-[#991B1B] text-xs"
							: "text-[#94A3B8] text-xs"
					}
				>
					{t("nameHint")}
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor="shop-handle">{t("handle")}</Label>
				<Controller
					control={control}
					name="handle"
					render={({ field }) => (
						<HandleInput
							value={field.value}
							onChange={field.onChange}
							status={status}
							disabled={createShop.isPending}
						/>
					)}
				/>
				{formState.errors.handle?.message && (
					<p className="text-[#991B1B] text-xs">
						{formState.errors.handle.message}
					</p>
				)}
			</div>

			<div className="space-y-2">
				<Label htmlFor="shop-city">{t("city")}</Label>
				<Controller
					control={control}
					name="city"
					render={({ field }) => (
						<CitySelect
							id="shop-city"
							value={field.value}
							onChange={(city) => field.onChange(city?.name ?? "")}
							placeholder={t("cityPlaceholder")}
						/>
					)}
				/>
			</div>

			<fieldset className="space-y-2">
				<legend className="mb-2 font-medium text-[#0F172A] text-sm">
					{t("categories", { count: selected.length })}
				</legend>
				<Controller
					control={control}
					name="categories"
					render={({ field }) => (
						<CategoryChips
							categories={categories}
							selected={field.value}
							onChange={field.onChange}
							max={SHOP_CATEGORIES_MAX}
						/>
					)}
				/>
			</fieldset>

			<PhoneRequirement returnTo="/shop/new" />

			{formState.errors.root?.message && (
				<p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm">
					{formState.errors.root.message}
				</p>
			)}

			<div className="space-y-2">
				<Button
					type="submit"
					disabled={!canSubmit}
					className="h-12 w-full rounded-xl bg-[#1E40AF] font-semibold text-base hover:bg-[#1E3A8A]"
				>
					{createShop.isPending && (
						<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
					)}
					{t("submit")}
				</Button>
				<p className="text-center text-[#64748B] text-xs">{t("submitHint")}</p>
			</div>
		</form>
	);
}
