import type { Metadata } from "next";
import Link from "next/link";
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

	const tRoot = await getTranslations();

	return (
		<>
			{can(mine.role, "activity.view") && (
				<div className="mb-3 text-right">
					<Link
						href="/seller/team/activity"
						className="font-medium text-[#1E40AF] text-sm hover:underline"
					>
						{tRoot("Seller.nav.activity")}
					</Link>
				</div>
			)}
			<TeamClient shopId={mine.shop.id} role={mine.role} />
		</>
	);
}
