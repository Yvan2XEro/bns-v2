"use client";

import { MessageSquare, Plus, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AccountMenu } from "~/components/layout/account-menu";
import { LocaleSwitcher } from "~/components/layout/locale-switcher";
import { useAppConfig } from "~/hooks/use-app-config";
import { useAuth } from "~/hooks/use-auth";
import { useMyShops } from "~/hooks/use-my-shops";
import { useSellerOrderQueue } from "~/hooks/use-seller-orders";
import { accountSections } from "~/lib/nav";
import { activeNavKey } from "~/lib/seller-nav";
import { can } from "~/lib/shop-roles";
import type { ShopRole } from "~/types";
import { useSellerPageMeta } from "./seller-page-meta";

const CHIP =
	"inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-semibold text-xs transition-colors";

/**
 * The seller space's top bar, in view on every page: where the seller is
 * (shop › section), what is waiting for them (orders to process, unread
 * messages — shown only when there are some, each a link to its page), the
 * quick "new product", the alerts and the account menu (profile, purchases,
 * sign-out). The sidebar keeps the navigation; this bar keeps the work.
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
	const router = useRouter();
	const { user, logout } = useAuth();
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
	const page = useSellerPageMeta();

	return (
		<div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-line border-b bg-surface/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80 lg:px-6">
			<nav
				aria-label={t("whereAmI")}
				className="hidden min-w-0 flex-1 items-center gap-1.5 text-sm md:flex"
			>
				<Link href="/seller" className="truncate text-ink-muted hover:text-ink">
					{shopName}
				</Link>
				{section && section !== "dashboard" && (
					<>
						<span aria-hidden="true" className="text-ink-faint">
							›
						</span>
						{page?.sectionHref ? (
							<Link
								href={page.sectionHref}
								className="truncate text-ink-muted hover:text-ink"
							>
								{tNav(`nav.${section}`)}
							</Link>
						) : (
							<span
								className={
									page
										? "truncate text-ink-muted"
										: "truncate font-semibold text-ink"
								}
							>
								{tNav(`nav.${section}`)}
							</span>
						)}
					</>
				)}
				{page && (
					<>
						<span aria-hidden="true" className="text-ink-faint">
							›
						</span>
						<span className="truncate font-semibold text-ink">
							{page.reference}
						</span>
						{page.details?.length ? (
							<span className="hidden shrink-0 truncate pl-2 text-ink-muted text-xs xl:inline">
								{page.details.join(" · ")}
							</span>
						) : null}
					</>
				)}
			</nav>

			<div className="ml-auto flex items-center gap-1.5">
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
				{bell}
				<div className="lg:hidden">
					<LocaleSwitcher />
				</div>
				{user && (
					<AccountMenu
						user={user}
						sections={accountSections({
							ordersEnabled,
							shopEntry: { href: "/seller", shopName },
						})}
						onLogout={async () => {
							await logout();
							router.push("/");
						}}
					/>
				)}
			</div>
		</div>
	);
}
