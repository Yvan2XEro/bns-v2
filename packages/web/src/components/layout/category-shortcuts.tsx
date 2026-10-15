"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { categoryHref, type NavRubric, shopsDirectoryHref } from "~/lib/nav";

/** The rubric shortcuts under the header, on the home and search pages only. */
export function CategoryShortcuts({
	rubrics,
	shopsEnabled,
}: {
	rubrics: NavRubric[];
	shopsEnabled: boolean;
}) {
	const t = useTranslations("Nav");
	if (rubrics.length === 0) return null;
	const chip =
		"block whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD]";
	return (
		<nav
			aria-label={t("shortcuts")}
			className="border-[#E2E8F0] border-b bg-white"
		>
			<ul className="container mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6 lg:px-8">
				{rubrics.map((rubric) => (
					<li key={rubric.id}>
						<Link
							href={categoryHref(rubric.id)}
							className={`${chip} border-[#E2E8F0] text-[#475569] hover:border-[#94A3B8] hover:text-[#0F172A]`}
						>
							{rubric.name}
						</Link>
					</li>
				))}
				{shopsEnabled && (
					<li>
						<Link
							href={shopsDirectoryHref({ verified: true })}
							className={`${chip} border-[#BFDBFE] bg-[#EFF6FF] font-semibold text-[#1E40AF] hover:border-[#1E40AF]`}
						>
							{t("verifiedShops")}
						</Link>
					</li>
				)}
			</ul>
		</nav>
	);
}
