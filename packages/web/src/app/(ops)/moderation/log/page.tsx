import type { Metadata } from "next";
import { Suspense } from "react";
import { LogClient } from "./log-client";

export const metadata: Metadata = { title: "Moderation log" };

export default function LogPage() {
	return (
		<Suspense>
			<LogClient />
		</Suspense>
	);
}
