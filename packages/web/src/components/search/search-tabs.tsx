import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";

export function SearchTabs({
	active,
	q,
}: {
	active: "listings" | "shops";
	q: string;
}) {
	const t = useTranslations("Search");
	const query = q ? `q=${encodeURIComponent(q)}` : "";
	const tabs = [
		{
			key: "listings" as const,
			href: `/search${query ? `?${query}` : ""}`,
			label: t("tabListings"),
		},
		{
			key: "shops" as const,
			href: `/search?tab=shops${query ? `&${query}` : ""}`,
			label: t("tabShops"),
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
							"-mb-px border-b-2 pb-2 font-semibold text-sm",
							active === tab.key
								? "border-[#1E40AF] text-[#1E40AF]"
								: "border-transparent text-[#64748B] hover:text-[#0F172A]",
						)}
					>
						{tab.label}
					</Link>
				))}
			</div>
		</div>
	);
}
