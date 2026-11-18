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
		<label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-4">
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				className="mt-0.5 h-4 w-4 accent-brand"
			/>
			<span className="flex-1">
				<span className="flex items-center gap-2 font-medium text-ink text-sm">
					<Store className="h-4 w-4 text-brand" />
					{t("publishIn", { shop: shopName })}
				</span>
				<span className="block text-ink-muted text-xs">
					{t("publishInHint")}
				</span>
			</span>
		</label>
	);
}
