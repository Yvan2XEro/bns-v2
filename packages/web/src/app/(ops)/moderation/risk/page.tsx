import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionPlaceholder } from "~/components/moderation/section-placeholder";

export const metadata: Metadata = { title: "Risk flags" };

/** Placeholder until the next lot builds this section. */
export default function RiskPage() {
	return (
		<Suspense>
			<SectionPlaceholder section="risk" />
		</Suspense>
	);
}
