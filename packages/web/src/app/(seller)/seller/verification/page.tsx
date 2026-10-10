import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { VerificationClient } from "./verification-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Verification");
	return { title: t("hub.title") };
}

export default async function VerificationPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");

	return <VerificationClient shopId={mine.shop.id} />;
}
