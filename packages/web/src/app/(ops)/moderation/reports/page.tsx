import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportsClient } from "./reports-client";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
	return (
		<Suspense>
			<ReportsClient />
		</Suspense>
	);
}
