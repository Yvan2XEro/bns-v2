"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
	PRODUCT_TABS,
	type ProductTab,
	productTabHref,
} from "~/lib/product-tabs";
import { cn } from "~/lib/utils";

/** The product editor's tabs, one path each; a tab with issues counts them. */
export function ProductTabs({
	productId,
	current,
	issues,
}: {
	productId: string;
	current: ProductTab;
	issues: Record<Exclude<ProductTab, "stock">, number>;
}) {
	const t = useTranslations("ProductEditor");

	return (
		<nav
			aria-label={t("tabsLabel")}
			className="-mx-1 flex gap-1 overflow-x-auto border-line border-b px-1"
		>
			{PRODUCT_TABS.map((tab) => {
				const count = tab === "stock" ? 0 : issues[tab];
				return (
					<Link
						key={tab}
						href={productTabHref(productId, tab)}
						scroll={false}
						aria-current={tab === current ? "page" : undefined}
						className={cn(
							"-mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 font-medium text-sm",
							tab === current
								? "border-[var(--shop-accent,var(--c-brand))] text-ink"
								: "border-transparent text-ink-muted hover:text-ink",
						)}
					>
						{t(`tabs.${tab}`)}
						{count > 0 && (
							<span
								role="img"
								aria-label={t("tabIssues", { count })}
								className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-bad-soft px-1.5 font-semibold text-bad-ink text-xs"
							>
								{count}
							</span>
						)}
					</Link>
				);
			})}
		</nav>
	);
}
