"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ShopProfilePicker } from "~/components/shop/shop-profile-picker";
import { useUpdateShop } from "~/hooks/use-shop-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import type { ShopProfile } from "~/lib/shop-profile";

/**
 * Changes the kind of business. The workspace is rendered on the server
 * around it, so a saved change refreshes the page: the sidebar gains or loses
 * the catalogue, stock and orders with it.
 */
export function ShopProfileForm({
	shopId,
	profile,
	readOnly,
}: {
	shopId: string;
	profile: ShopProfile;
	readOnly: boolean;
}) {
	const t = useTranslations("ShopProfile");
	const tRoot = useTranslations();
	const router = useRouter();
	const update = useUpdateShop(shopId);
	const [value, setValue] = useState<ShopProfile>(profile);
	const [saved, setSaved] = useState(false);

	function save() {
		setSaved(false);
		update.mutate(
			{ profile: value },
			{
				onSuccess: () => {
					setSaved(true);
					router.refresh();
				},
			},
		);
	}

	return (
		<div className="space-y-3">
			<p className="text-ink-muted text-sm">{t("retailNote")}</p>
			<ShopProfilePicker
				value={value}
				onChange={(next) => {
					setSaved(false);
					setValue(next);
				}}
				disabled={readOnly || update.isPending}
			/>
			{update.isError && (
				<p className="text-bad-ink text-sm">
					{resolveErrorMessage(update.error, tRoot)}
				</p>
			)}
			{!readOnly && (
				<div className="flex items-center gap-3">
					<button
						type="button"
						disabled={value === profile || update.isPending}
						onClick={save}
						className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--shop-accent,var(--c-brand-fill))] px-4 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))] disabled:opacity-50"
					>
						{update.isPending && (
							<LoaderCircle className="h-4 w-4 animate-spin" />
						)}
						{t("save")}
					</button>
					{saved && (
						<span className="text-ink-muted text-sm">{t("saved")}</span>
					)}
				</div>
			)}
		</div>
	);
}
