"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Controller, useForm, useWatch } from "react-hook-form";
import { HandleInput } from "~/components/shop/handle-input";
import { shopUrl } from "~/lib/shop-url";
import { Button } from "~/components/ui/button";
import { useHandleAvailability } from "~/hooks/use-handle-availability";
import { useChangeHandle } from "~/hooks/use-shop-settings";
import { ERROR_CODES, resolveErrorMessage } from "~/lib/apiError";
import { type ChangeHandleValues, changeHandleSchema } from "~/lib/shop-form";
import { isShopOwner } from "~/lib/shop-roles";
import type { MyShop, ShopRole } from "~/types";

const HANDLE_ERROR_CODES: string[] = [
	ERROR_CODES.shopHandleTaken,
	ERROR_CODES.shopHandleReserved,
	ERROR_CODES.shopHandleInvalid,
	ERROR_CODES.shopHandleCooldown,
];

export function HandleForm({
	shop,
	role,
}: {
	shop: MyShop;
	role: ShopRole | null;
}) {
	const t = useTranslations("ShopManage");
	const tRoot = useTranslations();
	const locale = useLocale();
	const router = useRouter();
	const changeHandle = useChangeHandle(shop.id);

	const { control, formState, handleSubmit, setError } =
		useForm<ChangeHandleValues>({
			resolver: zodResolver(changeHandleSchema),
			mode: "onChange",
			defaultValues: { handle: shop.handle },
		});
	const handle = useWatch({ control, name: "handle" });
	const { status } = useHandleAvailability(handle, {
		currentHandle: shop.handle,
	});

	const next = shop.nextHandleChangeAt
		? new Date(shop.nextHandleChangeAt)
		: null;
	const locked = next !== null && next.getTime() > Date.now();

	if (!isShopOwner(role)) {
		return <p className="text-[#64748B] text-sm">{t("addressOwnerOnly")}</p>;
	}

	const onSubmit = handleSubmit(async (values) => {
		try {
			await changeHandle.mutateAsync(values.handle);
			router.refresh();
		} catch (error) {
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
		<form onSubmit={onSubmit} className="space-y-4" noValidate>
			<p className="text-[#334155] text-sm">
				{t("addressCurrent", {
					url: shopUrl(shop.handle).replace(/^https?:\/\//, ""),
				})}
			</p>
			<Controller
				control={control}
				name="handle"
				render={({ field }) => (
					<HandleInput
						value={field.value}
						onChange={field.onChange}
						status={status}
						disabled={locked || changeHandle.isPending}
					/>
				)}
			/>
			{formState.errors.handle?.message && (
				<p className="text-red-700 text-xs">
					{formState.errors.handle.message}
				</p>
			)}
			{locked && next && (
				<p className="text-[#92400e] text-sm">
					{t("addressLocked", {
						date: next.toLocaleDateString(locale, {
							day: "numeric",
							month: "long",
						}),
					})}
				</p>
			)}
			<p className="text-[#64748B] text-xs">{t("addressRedirect")}</p>
			{formState.errors.root?.message && (
				<p className="text-red-700 text-sm">{formState.errors.root.message}</p>
			)}
			<Button
				type="submit"
				disabled={
					locked ||
					changeHandle.isPending ||
					!formState.isValid ||
					status !== "available"
				}
				className="bg-[#1E40AF] hover:bg-[#1E3A8A]"
			>
				{changeHandle.isPending && (
					<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
				)}
				{t("addressSave")}
			</Button>
		</form>
	);
}
