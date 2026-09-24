"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useCloseShop } from "~/hooks/use-shop-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import { type CloseShopValues, closeShopSchema } from "~/lib/shop-form";
import { isShopOwner } from "~/lib/shop-roles";
import type { MyShop, ShopRole } from "~/types";

export function CloseShopForm({
	shop,
	role,
}: {
	shop: MyShop;
	role: ShopRole | null;
}) {
	const t = useTranslations("ShopManage");
	const tRoot = useTranslations();
	const router = useRouter();
	const closeShop = useCloseShop(shop.id);

	const { formState, handleSubmit, register, setError } =
		useForm<CloseShopValues>({
			resolver: zodResolver(closeShopSchema(shop.handle)),
			mode: "onChange",
			defaultValues: { confirmation: "" },
		});

	if (!isShopOwner(role)) {
		return <p className="text-[#64748B] text-sm">{t("closeOwnerOnly")}</p>;
	}

	const onSubmit = handleSubmit(async (values) => {
		try {
			await closeShop.mutateAsync(values.confirmation);
			router.push("/profile/me");
			router.refresh();
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	});

	return (
		<form
			onSubmit={onSubmit}
			className="space-y-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-5"
			noValidate
		>
			<p className="font-semibold text-[#991b1b]">{t("closeTitle")}</p>
			<ul className="list-disc space-y-1 pl-5 text-[#7f1d1d] text-sm">
				<li>{t("closeListings")}</li>
				<li>{t("closeHandle")}</li>
				<li>{t("closeFinal")}</li>
			</ul>
			<div className="space-y-1.5">
				<label
					htmlFor="close-confirmation"
					className="block text-[#7f1d1d] text-sm"
				>
					{t("closeConfirm", { handle: shop.handle })}
				</label>
				<Input
					id="close-confirmation"
					className="bg-white"
					autoComplete="off"
					{...register("confirmation")}
				/>
			</div>
			{formState.errors.root?.message && (
				<p className="text-red-700 text-sm">{formState.errors.root.message}</p>
			)}
			<Button
				type="submit"
				variant="destructive"
				disabled={!formState.isValid || closeShop.isPending}
			>
				{closeShop.isPending && (
					<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
				)}
				{t("closeSubmit")}
			</Button>
		</form>
	);
}
