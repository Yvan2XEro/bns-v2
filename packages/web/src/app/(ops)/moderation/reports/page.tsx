import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionPlaceholder } from "~/components/moderation/section-placeholder";

export const metadata: Metadata = { title: "Reports" };

/** Placeholder until the next lot builds this section. */
export default function ReportsPage() {
	return (
		<Suspense>
			<SectionPlaceholder section="reports" />
		</Suspense>
	);
}
