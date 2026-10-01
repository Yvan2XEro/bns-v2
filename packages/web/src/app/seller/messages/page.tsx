import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_SHOP_COOKIE, resolveActiveShop } from "~/lib/active-shop";
import { getAuthUser, serverGet } from "~/lib/server-api";
import type { MyShopsEntry } from "~/types";
import { InboxClient } from "./inbox-client";

export default async function SellerMessagesPage() {
	const [user, cookieStore, shops] = await Promise.all([
		getAuthUser(),
		cookies(),
		serverGet<MyShopsEntry[]>("/api/me/shops"),
	]);

	const active = resolveActiveShop(
		shops ?? [],
		cookieStore.get(ACTIVE_SHOP_COOKIE)?.value ?? null,
	);
	if (!active || !user) redirect("/shop/new");

	return (
		<InboxClient shopId={active.shopId} role={active.role} viewerId={user.id} />
	);
}
