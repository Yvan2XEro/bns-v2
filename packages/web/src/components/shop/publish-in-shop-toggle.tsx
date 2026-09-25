"use client";

import { Store } from "lucide-react";
import { useTranslations } from "next-intl";

export function PublishInShopToggle({
	shopName,
	checked,
	onChange,
}: {
	shopName: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	const t = useTranslations("Shop");
	return (
		<label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#E2E8F0] p-4">
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				className="mt-0.5 h-4 w-4 accent-[#1E40AF]"
			/>
			<span className="flex-1">
				<span className="flex items-center gap-2 font-medium text-[#0F172A] text-sm">
					<Store className="h-4 w-4 text-[#1E40AF]" />
					{t("publishIn", { shop: shopName })}
				</span>
				<span className="block text-[#64748B] text-xs">
					{t("publishInHint")}
				</span>
			</span>
		</label>
	);
}
