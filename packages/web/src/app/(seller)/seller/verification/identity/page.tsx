import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { IdentityClient } from "./identity-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Verification");
	return { title: t("identity.pageTitle") };
}

export default async function VerificationIdentityPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");

	return <IdentityClient shopId={mine.shop.id} />;
}
