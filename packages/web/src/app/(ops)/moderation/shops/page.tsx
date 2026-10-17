import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionPlaceholder } from "~/components/moderation/section-placeholder";

export const metadata: Metadata = { title: "Shops" };

/** Placeholder until the next lot builds this section. */
export default function ShopsPage() {
	return (
		<Suspense>
			<SectionPlaceholder section="shops" />
		</Suspense>
	);
}
