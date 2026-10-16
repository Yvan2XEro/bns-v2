import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { can } from "~/lib/shop-roles";
import { ActivityClient } from "./activity-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("shopActivity");
	return { title: t("title") };
}

/**
 * `activity.view` gates the whole screen, not just a control on it: the
 * owner and managers hold it, staff do not (`ROLE_PERMISSIONS` in
 * `packages/api/src/access/shopRoles.ts`, mirrored in `~/lib/shop-roles`).
 * A staff member who guesses the url gets this panel, never a page that
 * fetches the log and only then fails.
 */
export default async function ShopActivityPage() {
	const mine = await getMyShop();
	if (!mine?.shop) redirect("/shop/new");

	if (!can(mine.role, "activity.view")) {
		const t = await getTranslations("shopActivity");
		return (
			<div
				role="alert"
				className="rounded-2xl border border-line bg-surface p-8 text-center text-ink-muted text-sm"
			>
				{t("locked")}
			</div>
		);
	}

	return <ActivityClient shopId={mine.shop.id} />;
}
