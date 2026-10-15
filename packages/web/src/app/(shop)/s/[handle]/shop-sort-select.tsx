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
			className="h-10 shrink-0 rounded-lg border border-[#E2E8F0] bg-white px-3 font-medium text-[#0F172A] text-sm focus:border-[var(--shop-accent,#93C5FD)] focus:outline-none"
		>
			{OPTIONS.map((option) => (
				<option key={option.value} value={option.value}>
					{t(option.key)}
				</option>
			))}
		</select>
	);
}
