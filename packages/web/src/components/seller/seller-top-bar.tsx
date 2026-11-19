"use client";

import { MessageSquare, Plus, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
	type Crumb,
	WorkspaceTopBar,
} from "~/components/workspace/workspace-top-bar";
import { useAppConfig } from "~/hooks/use-app-config";
import { useMyShops } from "~/hooks/use-my-shops";
import { useSellerOrderQueue } from "~/hooks/use-seller-orders";
import { activeNavKey } from "~/lib/seller-nav";
import { can } from "~/lib/shop-roles";
import type { ShopRole } from "~/types";

const CHIP =
	"inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-semibold text-xs transition-colors";

/**
 * The seller space's top bar: the shared workspace bar (trail, alerts,
 * account menu) with what is waiting for the seller (orders to process,
 * unread messages — shown only when there are some, each a link to its page)
 * and the quick "new product". The sidebar keeps the navigation; this bar
 * keeps the work.
 */
export function SellerTopBar({
	shopId,
	shopName,
	role,
	retail,
	bell,
}: {
	shopId: string;
	shopName: string;
	role: ShopRole | null;
	/** A store; an agency, a recruiter or a provider has no catalogue or orders. */
	retail: boolean;
	/** The alerts inbox, rendered by the server shell. */
	bell: ReactNode;
}) {
	const tNav = useTranslations("Seller");
	const t = useTranslations("SellerShell");
	const pathname = usePathname() ?? "/seller";
	const { ordersEnabled } = useAppConfig();
	const { data: myShops } = useMyShops();
	// The sidebar asks for the same queue; the query is shared, not repeated.
	const queue = useSellerOrderQueue(
		ordersEnabled && retail && can(role, "orders.view") ? shopId : null,
	);
	const toProcess = (queue.data?.toAccept ?? 0) + (queue.data?.toShip ?? 0);
	const unread =
		myShops?.find((entry) => entry.shopId === shopId)?.inboxUnread ?? 0;
	const section = activeNavKey(pathname);
	const crumbs: Crumb[] = [
		{ label: shopName, href: "/seller" },
		...(section && section !== "dashboard"
			? [{ label: tNav(`nav.${section}`) }]
			: []),
	];

	return (
		<WorkspaceTopBar
			crumbs={crumbs}
			bell={bell}
			shopEntry={{ href: "/seller", shopName }}
			actions={
				<>
					{toProcess > 0 && (
						<Link
							href="/seller/orders"
							className={`${CHIP} bg-warn-soft text-warn-ink hover:brightness-95`}
						>
							<ShoppingBag aria-hidden="true" className="h-3.5 w-3.5" />
							{t("toProcess", { count: toProcess })}
						</Link>
					)}
					{unread > 0 && (
						<Link
							href="/seller/messages"
							className={`${CHIP} bg-[var(--shop-accent-soft,var(--c-brand-soft))] text-[var(--shop-accent-text,var(--c-brand))] hover:brightness-95`}
						>
							<MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
							{t("unreadMessages", { count: unread })}
						</Link>
					)}
					{retail && can(role, "catalogue.edit") && (
						<Link
							href="/seller/catalogue/new"
							aria-label={t("newProduct")}
							className="hidden h-9 items-center gap-1.5 rounded-lg bg-[var(--shop-accent,var(--c-brand-fill))] px-3 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))] sm:inline-flex"
						>
							<Plus aria-hidden="true" className="h-4 w-4" />
							<span className="hidden xl:inline">{t("newProduct")}</span>
						</Link>
					)}
				</>
			}
		/>
	);
}
