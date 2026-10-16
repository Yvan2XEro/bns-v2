import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "~/lib/utils";

export function SearchTabs({
	active,
	hrefs,
	counts,
}: {
	active: "listings" | "shops";
	/** Each tab's link, carrying the filters both tabs share. */
	hrefs: { listings: string; shops: string };
	/** A count the server could not read is left off rather than shown as 0. */
	counts?: { listings: number | null; shops: number | null };
}) {
	const t = useTranslations("Search");
	const locale = useLocale();
	const tabs = [
		{
			key: "listings" as const,
			href: hrefs.listings,
			label: t("tabListings"),
			count: counts?.listings ?? null,
		},
		{
			key: "shops" as const,
			href: hrefs.shops,
			label: t("tabShops"),
			count: counts?.shops ?? null,
		},
	];

	return (
		<div className="container mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
			<div className="flex gap-6 border-[#E2E8F0] border-b">
				{tabs.map((tab) => (
					<Link
						key={tab.key}
						href={tab.href}
						className={cn(
							"-mb-px flex items-center gap-1.5 border-b-2 pb-2 font-semibold text-sm",
							active === tab.key
								? "border-[#1E40AF] text-[#1E40AF]"
								: "border-transparent text-[#64748B] hover:text-[#0F172A]",
						)}
					>
						{tab.label}
						{tab.count !== null && (
							<span
								className={cn(
									"rounded-[10px] px-[7px] py-px font-semibold text-xs tabular-nums",
									active === tab.key
										? "bg-[#1E40AF] text-white"
										: "bg-[#E2E8F0] text-[#64748B]",
								)}
							>
								{tab.count.toLocaleString(locale)}
							</span>
						)}
					</Link>
				))}
			</div>
		</div>
	);
}
