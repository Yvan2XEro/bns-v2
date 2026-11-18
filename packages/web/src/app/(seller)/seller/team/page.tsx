import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { can } from "~/lib/shop-roles";
import { TeamClient } from "./team-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Team");
	return { title: t("title") };
}

export default async function TeamPage() {
	const mine = await getMyShop();
	const t = await getTranslations("Team");

	if (!mine?.shop) return <p>{t("noShop")}</p>;

	return (
		<TeamClient
			shopId={mine.shop.id}
			shopName={mine.shop.name}
			role={mine.role}
			canViewActivity={can(mine.role, "activity.view")}
		/>
	);
}
