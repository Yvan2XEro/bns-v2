"use client";

import { useTranslations } from "next-intl";
import type { ShopSort } from "~/lib/shop-page-params";

const OPTIONS: { value: ShopSort; key: string }[] = [
	{ value: "newest", key: "sortNewest" },
	{ value: "price_asc", key: "sortPriceAsc" },
	{ value: "price_desc", key: "sortPriceDesc" },
];

/** Lives inside the shop's GET search form, so changing it resubmits q and category with it. */
export function ShopSortSelect({ value }: { value: ShopSort }) {
	const t = useTranslations("ShopPage");
	return (
		<select
			name="sort"
			defaultValue={value}
			aria-label={t("sortLabel")}
			onChange={(event) => event.currentTarget.form?.requestSubmit()}
			className="h-10 shrink-0 rounded-lg border border-line bg-surface px-3 font-medium text-ink text-sm focus:border-[var(--shop-accent,var(--c-brand-line))] focus:outline-none"
		>
			{OPTIONS.map((option) => (
				<option key={option.value} value={option.value}>
					{t(option.key)}
				</option>
			))}
		</select>
	);
}
