import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_SHOP_COOKIE, resolveActiveShop } from "~/lib/active-shop";
import { getAuthUser, serverGet } from "~/lib/server-api";
import { getMyShop } from "~/lib/server-shop";
import type { MyShopsEntry } from "~/types";
import { InboxClient } from "./inbox-client";

export default async function SellerMessagesPage({
	searchParams,
}: {
	searchParams: Promise<{ conversation?: string }>;
}) {
	const { conversation } = await searchParams;
	const [user, cookieStore, shops, mine] = await Promise.all([
		getAuthUser(),
		cookies(),
		serverGet<MyShopsEntry[]>("/api/me/shops"),
		getMyShop(),
	]);

	// The layout's shop first, so the inbox never shows another shop than the sidebar.
	const active = resolveActiveShop(
		shops ?? [],
		mine?.shop?.id ?? cookieStore.get(ACTIVE_SHOP_COOKIE)?.value ?? null,
	);
	if (!active || !user) redirect("/shop/new");

	return (
		<InboxClient
			shopId={active.shopId}
			role={active.role}
			viewerId={user.id}
			initialConversationId={conversation ?? null}
		/>
	);
}
