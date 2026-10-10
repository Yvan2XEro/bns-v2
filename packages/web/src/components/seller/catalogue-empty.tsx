import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "~/components/empty-state";

/** First run, not a failure: an empty catalogue offers the two ways to fill it. */
export function CatalogueEmpty() {
	const t = useTranslations("Catalogue");
	return (
		<div className="rounded-xl border border-[#E2E8F0] border-dashed bg-white">
			<EmptyState
				illustration="listings"
				title={t("emptyTitle")}
				subtitle={t("emptyBody")}
				actions={
					<>
						<Link
							href="/seller/catalogue/new"
							className="inline-flex h-10 items-center rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
						>
							{t("add")}
						</Link>
						<Link
							href="/shop/manage?move=1"
							className="inline-flex h-10 items-center rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-[#0F172A] text-sm hover:border-[#93C5FD]"
						>
							{t("moveListings")}
						</Link>
					</>
				}
			/>
		</div>
	);
}
