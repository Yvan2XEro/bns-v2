import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { QueueClient } from "./queue-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("ModerationConsole");
	return { title: `${t("nav.disputes")} · ${t("consoleTitle")}` };
}

export default function DisputesQueuePage() {
	return <QueueClient />;
}
