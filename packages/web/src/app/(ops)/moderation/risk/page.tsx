import type { Metadata } from "next";
import { Suspense } from "react";
import { RiskClient } from "./risk-client";

export const metadata: Metadata = { title: "Risk flags" };

export default function RiskPage() {
	return (
		<Suspense>
			<RiskClient />
		</Suspense>
	);
}
