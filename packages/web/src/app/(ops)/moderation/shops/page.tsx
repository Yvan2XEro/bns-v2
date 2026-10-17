import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ShopsClient } from "./shops-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("ModerationConsole");
	return { title: `${t("nav.shops")} · ${t("consoleTitle")}` };
}

export default function ShopsPage() {
	return (
		<Suspense>
			<ShopsClient />
		</Suspense>
	);
}
