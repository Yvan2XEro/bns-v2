"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CategoryIcon } from "~/components/category-icon";
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
		"flex items-center gap-1.5 whitespace-nowrap rounded-full border py-1 pr-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-line";
	return (
		<nav
			aria-label={t("shortcuts")}
			className="border-line border-b bg-surface"
		>
			<ul className="container mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6 lg:px-8">
				{rubrics.map((rubric) => (
					<li key={rubric.id}>
						<Link
							href={categoryHref(rubric.id)}
							className={`${chip} border-line pl-1 text-ink-mid hover:border-ink-faint hover:text-ink`}
						>
							<CategoryIcon
								category={rubric}
								imageUrl={rubric.imageUrl}
								size={20}
								decorative
							/>
							{rubric.name}
						</Link>
					</li>
				))}
				{shopsEnabled && (
					<li>
						<Link
							href={shopsDirectoryHref({ verified: true })}
							className={`${chip} border-brand-tint-strong bg-brand-soft pl-3 font-semibold text-brand hover:border-brand`}
						>
							{t("verifiedShops")}
						</Link>
					</li>
				)}
			</ul>
		</nav>
	);
}
