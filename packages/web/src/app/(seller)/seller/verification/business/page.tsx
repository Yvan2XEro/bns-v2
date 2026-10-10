import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { BusinessClient } from "./business-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Verification");
	return { title: t("business.pageTitle") };
}

export default async function VerificationBusinessPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");

	return <BusinessClient shopId={mine.shop.id} />;
}
