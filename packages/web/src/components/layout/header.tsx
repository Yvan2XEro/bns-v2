"use client";

import { Heart, MessageCircle, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { NotificationInbox } from "~/components/layout/notification-inbox";
import { ShopInitials } from "~/components/shop/shop-initials";
import { useAppConfig } from "~/hooks/use-app-config";
import { useAuth } from "~/hooks/use-auth";
import { useMyShop } from "~/hooks/use-my-shop";
import { useNavCategories } from "~/hooks/use-nav-categories";
import { usePlacePreferences } from "~/hooks/use-place-preferences";
import { useUnreadMessages } from "~/hooks/use-unread-messages";
import {
	accountSections,
	gatedHref,
	loginHref,
	type NavCategory,
	navRubrics,
	sellHref,
	shopHeaderCss,
	showShortcuts,
} from "~/lib/nav";
import { shopEntryFor } from "~/lib/shop-entry";
import { cn } from "~/lib/utils";
import type { ShopTheme } from "../../../../api/src/contracts/shopTheme";
import { AccountMenu } from "./account-menu";
import { CartButton } from "./cart-button";
import { CategoriesMenu } from "./categories-menu";
import { CategoryShortcuts } from "./category-shortcuts";
import { HeaderSearch } from "./header-search";
import { MobileTabBar } from "./mobile-nav";
import { UtilityBar } from "./utility-bar";

export interface HeaderShop {
	name: string;
	handle: string;
	logoUrl: string | null;
	theme: ShopTheme;
}

interface HeaderProps {
	novuAppId?: string;
	/** The category tree, when the layout already fetched it. */
	categories?: NavCategory[];
	/** On a shop's own pages: the main bar takes the shop's colours and identity. */
	shop?: HeaderShop;
}

const SHOP_HEAD = "bns-shop-head";

export function Header({ novuAppId, categories, shop }: HeaderProps) {
	const { user, logout } = useAuth();
	const router = useRouter();
	const pathname = usePathname();
	const t = useTranslations("Nav");
	const signedIn = Boolean(user);
	const unreadCount = useUnreadMessages(signedIn);
	const { shopsEnabled, ordersEnabled } = useAppConfig();
	const { data: myShop, error: myShopError } = useMyShop();
	const entry = shopEntryFor(myShop, shopsEnabled, myShopError);
	const { browsePlace } = usePlacePreferences();

	const shortcuts = showShortcuts(pathname);
	const [wantCategories, setWantCategories] = useState(false);
	const wantTree = useCallback(() => setWantCategories(true), []);
	const tree = useNavCategories(categories, wantCategories || shortcuts);
	const rubrics = useMemo(() => navRubrics(tree), [tree]);

	const sections = accountSections({
		ordersEnabled,
		shopEntry: entry
			? {
					href: entry.href,
					...(myShop?.shop?.name ? { shopName: myShop.shop.name } : {}),
				}
			: null,
	});
	const here = pathname ?? "/";

	const handleLogout = async () => {
		await logout();
		router.push("/");
	};

	const themed = Boolean(shop);
	const iconTone = themed
		? "text-[var(--shop-head-muted)] hover:bg-white/10 hover:text-[var(--shop-head-fg)] focus-visible:ring-[var(--shop-head-fg)]"
		: "text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-[#93C5FD]";

	return (
		<>
			<UtilityBar
				sellHref={sellHref({ signedIn, shopEntry: entry, shopsEnabled })}
			/>
			<header
				data-shop-mode={themed ? "" : undefined}
				className={cn(
					"sticky top-0 z-50 w-full border-b",
					themed
						? `${SHOP_HEAD} border-transparent bg-[var(--shop-head-bg)] text-[var(--shop-head-fg)]`
						: "border-[#E2E8F0] bg-white text-[#0F172A]",
				)}
			>
				{shop && <style>{shopHeaderCss(`.${SHOP_HEAD}`, shop.theme)}</style>}
				<div className="relative">
					<div className="container mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6 md:h-16 md:gap-3 lg:px-8">
						<Link
							href="/"
							aria-label={t("home")}
							className="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD]"
						>
							<Image
								src="/logo.png"
								alt=""
								width={32}
								height={32}
								className="h-8 w-8 object-contain"
							/>
							<span
								className={cn(
									"font-bold font-heading text-lg",
									themed ? "hidden lg:inline" : "hidden sm:inline",
								)}
							>
								Buy<span className="text-[#F59E0B]">&apos;N&apos;</span>Sellem
							</span>
						</Link>

						{shop && (
							<Link
								href={`/s/${shop.handle}`}
								className="flex min-w-0 items-center gap-2 rounded-lg border-white/25 border-l pl-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shop-head-fg)] md:max-w-[12rem]"
							>
								<span aria-hidden="true">
									<ShopInitials
										name={shop.name}
										logoUrl={shop.logoUrl}
										className="h-7 w-7 rounded-lg text-[11px]"
									/>
								</span>
								<span className="truncate font-semibold text-sm">
									{shop.name}
								</span>
							</Link>
						)}

						<div className="hidden md:block">
							<CategoriesMenu
								rubrics={rubrics}
								city={browsePlace?.name ?? null}
								shopsEnabled={shopsEnabled}
								themed={themed}
								onWanted={wantTree}
							/>
						</div>

						<div className="hidden min-w-[22rem] flex-1 md:flex lg:min-w-[28rem]">
							<HeaderSearch shop={shop} />
						</div>
						<div className="flex-1 md:hidden" />

						<div className="flex shrink-0 items-center gap-0.5">
							<NavIcon
								href={gatedHref(signedIn, "/favorites")}
								label={t("favorites")}
								tone={iconTone}
								className="hidden md:flex"
							>
								<Heart aria-hidden="true" className="h-5 w-5" />
							</NavIcon>
							{signedIn && (
								<NavIcon
									href="/messages"
									label={t("messages")}
									ariaLabel={
										unreadCount > 0
											? `${t("messages")}, ${t("unread", { count: unreadCount })}`
											: undefined
									}
									tone={iconTone}
									className="hidden md:flex"
								>
									<span className="relative">
										<MessageCircle aria-hidden="true" className="h-5 w-5" />
										{unreadCount > 0 && (
											<span className="-top-1.5 -right-2 absolute flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 font-bold text-[10px] text-white">
												{unreadCount > 99 ? "99+" : unreadCount}
											</span>
										)}
									</span>
								</NavIcon>
							)}
							{signedIn && novuAppId && (
								<div className="flex flex-col items-center">
									<NotificationInbox
										applicationIdentifier={novuAppId}
										bellColor={themed ? "var(--shop-head-fg)" : "#475569"}
									/>
									<span
										aria-hidden="true"
										className="-mt-1 hidden text-[11px] xl:block"
									>
										{t("alerts")}
									</span>
								</div>
							)}
							{signedIn && (
								<CartButton
									className={
										themed
											? "text-[var(--shop-head-fg)]! hover:bg-white/10!"
											: undefined
									}
								/>
							)}
							{user ? (
								<div className="hidden md:block">
									<AccountMenu
										user={user}
										sections={sections}
										onLogout={handleLogout}
										themed={themed}
									/>
								</div>
							) : (
								<div className="hidden items-center gap-1.5 pl-1 md:flex">
									<Link
										href={loginHref(here)}
										className={cn(
											"flex h-10 items-center whitespace-nowrap rounded-lg border px-3 font-semibold text-sm focus-visible:outline-none focus-visible:ring-2",
											themed
												? "border-white/30 text-[var(--shop-head-fg)] hover:bg-white/10 focus-visible:ring-[var(--shop-head-fg)]"
												: "border-[#E2E8F0] bg-white text-[#0F172A] hover:border-[#94A3B8] focus-visible:ring-[#93C5FD]",
										)}
									>
										{t("logIn")}
									</Link>
								</div>
							)}
						</div>

						<Link
							href={gatedHref(signedIn, "/create")}
							aria-label={t("postAd")}
							title={t("postAd")}
							className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F59E0B] font-extrabold text-[#0F172A] text-sm hover:bg-[#D97706] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A] focus-visible:ring-offset-2 md:flex"
						>
							<Plus aria-hidden="true" className="h-5 w-5" />
						</Link>
					</div>
				</div>

				<div className="container mx-auto max-w-7xl px-4 pb-2 sm:px-6 md:hidden">
					<HeaderSearch shop={shop} compact />
				</div>
			</header>

			{shortcuts && (
				<CategoryShortcuts rubrics={rubrics} shopsEnabled={shopsEnabled} />
			)}

			<MobileTabBar
				pathname={pathname}
				signedIn={signedIn}
				unreadCount={unreadCount}
				rubrics={rubrics}
				shopsEnabled={shopsEnabled}
				account={sections}
				userLabel={user ? { name: user.name ?? "", email: user.email } : null}
				onLogout={handleLogout}
				onWantCategories={wantTree}
			/>
		</>
	);
}

function NavIcon({
	href,
	label,
	ariaLabel,
	tone,
	className,
	children,
}: {
	href: string;
	label: string;
	ariaLabel?: string;
	tone: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<Link
			href={href}
			aria-label={ariaLabel}
			className={cn(
				"h-10 min-w-10 flex-col items-center justify-center rounded-lg px-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2",
				tone,
				className,
			)}
		>
			{children}
			<span className="sr-only xl:not-sr-only">{label}</span>
		</Link>
	);
}
