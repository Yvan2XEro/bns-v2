import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ShopCategoryCount } from "~/lib/shop-category-groups";
import { cn } from "~/lib/utils";

/**
 * The shop's own categories, counted over its published listings. A vertical
 * list in the sidebar from `lg`, a scrollable chip row above the listings
 * below it — the sidebar sits far above the grid on a phone.
 */
export function ShopCategories({
	categories,
	total,
	selected,
	hrefFor,
	layout,
}: {
	categories: ShopCategoryCount[];
	total: number;
	selected: string | null;
	hrefFor: (categoryId: string | null) => string;
	layout: "sidebar" | "chips";
}) {
	const t = useTranslations("Shop");
	const items = [
		{ id: null, name: t("allCategories"), count: total },
		...categories,
	];

	if (layout === "chips") {
		return (
			<nav
				aria-label={t("categories")}
				className="-mx-4 sm:-mx-6 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:px-6 lg:hidden"
			>
				{items.map((item) => {
					const active = item.id === selected;
					return (
						<Link
							key={item.id ?? "all"}
							href={hrefFor(item.id)}
							aria-current={active ? "page" : undefined}
							className={cn(
								"inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 font-medium text-sm",
								active
									? "border-[var(--shop-accent-border)] bg-[var(--shop-accent-soft)] text-[var(--shop-accent-text)]"
									: "border-[#E2E8F0] bg-white text-[#334155]",
							)}
						>
							{item.name}
							<span
								className={
									active ? "text-[var(--shop-accent-text)]" : "text-[#94A3B8]"
								}
							>
								{item.count}
							</span>
						</Link>
					);
				})}
			</nav>
		);
	}

	return (
		<nav
			aria-label={t("categories")}
			className="hidden rounded-xl border border-[#E2E8F0] bg-white px-2.5 py-4 lg:block"
		>
			<h2 className="mb-2.5 px-1.5 font-bold text-[#0F172A] text-[15px]">
				{t("categories")}
			</h2>
			{items.map((item) => {
				const active = item.id === selected;
				return (
					<Link
						key={item.id ?? "all"}
						href={hrefFor(item.id)}
						aria-current={active ? "page" : undefined}
						className={cn(
							"flex justify-between gap-3 rounded-lg px-2.5 py-2 text-sm",
							active
								? "bg-[var(--shop-accent-soft)] font-semibold text-[var(--shop-accent-text)]"
								: "text-[#334155] hover:bg-[var(--shop-accent-soft)]",
						)}
					>
						<span className="min-w-0 truncate">{item.name}</span>
						<span className={active ? undefined : "text-[#94A3B8]"}>
							{item.count}
						</span>
					</Link>
				);
			})}
		</nav>
	);
}
