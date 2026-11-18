import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { QueueClient } from "./queue-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("ModerationConsole");
	return { title: `${t("nav.queue")} · ${t("consoleTitle")}` };
}

export default function ModerationQueuePage() {
	return (
		<Suspense>
			<QueueClient />
		</Suspense>
	);
}
