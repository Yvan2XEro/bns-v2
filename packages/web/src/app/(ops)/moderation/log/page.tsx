import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionPlaceholder } from "~/components/moderation/section-placeholder";

export const metadata: Metadata = { title: "Moderation log" };

/** Placeholder until the next lot builds this section. */
export default function LogPage() {
	return (
		<Suspense>
			<SectionPlaceholder section="log" />
		</Suspense>
	);
}
