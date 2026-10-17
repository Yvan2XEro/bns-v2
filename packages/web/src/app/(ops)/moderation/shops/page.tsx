import type { Metadata } from "next";
import { Suspense } from "react";
import { ShopsClient } from "./shops-client";

export const metadata: Metadata = { title: "Shops" };

export default function ShopsPage() {
	return (
		<Suspense>
			<ShopsClient />
		</Suspense>
	);
}
