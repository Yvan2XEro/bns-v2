import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthUser } from "~/lib/server-api";
import { PurchasesClient } from "./purchases-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Purchases");
	return { title: t("title") };
}

export default async function PurchasesPage() {
	if (!(await getAuthUser())) redirect("/auth/login?redirect=/purchases");
	return <PurchasesClient />;
}
