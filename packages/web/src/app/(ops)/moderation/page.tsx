import type { Metadata } from "next";
import { Suspense } from "react";
import { QueueClient } from "./queue-client";

export const metadata: Metadata = { title: "Moderation queue" };

export default function ModerationQueuePage() {
	return (
		<Suspense>
			<QueueClient />
		</Suspense>
	);
}
