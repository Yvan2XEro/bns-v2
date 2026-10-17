import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionPlaceholder } from "~/components/moderation/section-placeholder";

export const metadata: Metadata = { title: "Shop sheet" };

/** Placeholder until Lot 4 builds the shop sheet; the queue's payout-account panel links here. */
export default function ShopSheetPage() {
	return (
		<Suspense>
			<SectionPlaceholder section="shop" />
		</Suspense>
	);
}
