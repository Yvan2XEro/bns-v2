import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthUser } from "~/lib/server-api";
import { BuyerDisputesClient } from "./buyer-disputes-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Disputes");
	return { title: t("title") };
}

export default async function BuyerDisputesPage() {
	if (!(await getAuthUser())) {
		redirect(`/auth/login?redirect=${encodeURIComponent("/account/disputes")}`);
	}
	return <BuyerDisputesClient />;
}
