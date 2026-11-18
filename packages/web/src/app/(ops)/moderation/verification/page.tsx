import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { QueueClient } from "./queue-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("ModerationConsole");
	return { title: `${t("nav.verification")} · ${t("consoleTitle")}` };
}

export default function VerificationQueuePage() {
	return <QueueClient />;
}
