import { PackagePlus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/** First run, not a failure: an empty catalogue offers the two ways to fill it. */
export function CatalogueEmpty() {
	const t = useTranslations("Catalogue");
	return (
		<div className="flex flex-col items-center rounded-xl border border-[#E2E8F0] border-dashed bg-white px-6 py-14 text-center">
			<PackagePlus aria-hidden="true" className="h-8 w-8 text-[#1E40AF]" />
			<p className="mt-3 font-semibold text-[#0F172A]">{t("emptyTitle")}</p>
			<p className="mt-1 max-w-sm text-[#64748B] text-sm">{t("emptyBody")}</p>
			<div className="mt-5 flex flex-wrap justify-center gap-2">
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
			</div>
		</div>
	);
}
