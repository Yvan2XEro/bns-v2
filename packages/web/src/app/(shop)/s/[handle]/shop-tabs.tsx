import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ShopTab } from "~/lib/shop-page-params";
import { cn } from "~/lib/utils";

export function ShopTabs({
	active,
	hrefFor,
	reviewCount,
}: {
	active: ShopTab;
	hrefFor: (tab: ShopTab) => string;
	reviewCount: number;
}) {
	const t = useTranslations("ShopPage");
	const tabs: { id: ShopTab; label: string }[] = [
		{ id: "listings", label: t("tabListings") },
		{
			id: "reviews",
			label:
				reviewCount > 0
					? `${t("tabReviews")} (${reviewCount})`
					: t("tabReviews"),
		},
		{ id: "about", label: t("tabAbout") },
	];
	return (
		<nav
			aria-label={t("tabsLabel")}
			className="mt-5 flex gap-7 overflow-x-auto font-semibold text-[15px]"
		>
			{tabs.map((tab) => (
				<Link
					key={tab.id}
					href={hrefFor(tab.id)}
					scroll={false}
					aria-current={tab.id === active ? "page" : undefined}
					className={cn(
						"shrink-0 border-b-2 py-3",
						tab.id === active
							? "border-[var(--shop-accent)] text-[var(--shop-accent-text)]"
							: "border-transparent text-[#64748B] hover:text-[#0F172A]",
					)}
				>
					{tab.label}
				</Link>
			))}
		</nav>
	);
}
