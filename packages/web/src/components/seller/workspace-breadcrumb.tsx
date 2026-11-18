import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SellerNavKey } from "~/lib/seller-nav";
import { SellerPageMeta } from "./seller-page-meta";

/** `Section › reference` for workspace detail pages (spec §5). List pages
 * show the title block instead and never render this. */
export function WorkspaceBreadcrumb({
	section,
	href,
	reference,
	details,
}: {
	section: SellerNavKey;
	href: string;
	reference: string;
	/** Facts the top bar keeps in view while the page scrolls (dates…). */
	details?: string[];
}) {
	const t = useTranslations("Seller");
	return (
		// From md up the top bar carries this trail (and keeps it in view);
		// a phone's bar has no room for it, so the page shows it there.
		<nav className="mb-4 text-ink-muted text-sm md:hidden">
			<SellerPageMeta
				reference={reference}
				sectionHref={href}
				details={details}
			/>
			<Link href={href} className="hover:underline">
				{t(`nav.${section}`)}
			</Link>
			<span className="mx-1.5">›</span>
			<span className="font-medium text-ink">{reference}</span>
		</nav>
	);
}
