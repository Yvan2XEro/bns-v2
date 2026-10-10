import type { Metadata } from "next";
import { QueueClient } from "./queue-client";

export const metadata: Metadata = {
	title: "Reviewer queue",
};

export default function VerificationQueuePage() {
	return <QueueClient />;
}
