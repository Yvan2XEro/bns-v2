import type { Metadata } from "next";
import { QueueClient } from "./queue-client";

export const metadata: Metadata = { title: "Disputes queue" };

export default function DisputesQueuePage() {
	return <QueueClient />;
}
