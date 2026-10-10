import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SellerNavKey } from "~/lib/seller-nav";

/** `Section › reference` for workspace detail pages (spec §5). List pages
 * show the title block instead and never render this. */
export function WorkspaceBreadcrumb({
	section,
	href,
	reference,
}: {
	section: SellerNavKey;
	href: string;
	reference: string;
}) {
	const t = useTranslations("Seller");
	return (
		<nav className="mb-4 text-[#64748B] text-sm">
			<Link href={href} className="hover:underline">
				{t(`nav.${section}`)}
			</Link>
			<span className="mx-1.5">›</span>
			<span className="font-medium text-[#0F172A]">{reference}</span>
		</nav>
	);
}
