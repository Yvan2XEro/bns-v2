import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "~/components/empty-state";

/** First run, not a failure: an empty catalogue offers the two ways to fill it. */
export function CatalogueEmpty() {
	const t = useTranslations("Catalogue");
	return (
		<div className="rounded-xl border border-line border-dashed bg-surface">
			<EmptyState
				illustration="listings"
				title={t("emptyTitle")}
				subtitle={t("emptyBody")}
				actions={
					<>
						<Link
							href="/seller/catalogue/new"
							className="inline-flex h-10 items-center rounded-lg bg-[var(--shop-accent,var(--c-brand))] px-4 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
						>
							{t("add")}
						</Link>
						<Link
							href="/seller/settings?move=1"
							className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 font-semibold text-ink text-sm hover:border-[var(--shop-accent-border,var(--c-brand-line))]"
						>
							{t("moveListings")}
						</Link>
					</>
				}
			/>
		</div>
	);
}
