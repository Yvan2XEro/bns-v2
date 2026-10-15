"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
	ChevronLeft,
	ChevronRight,
	Home,
	LayoutGrid,
	LogOut,
	MessageCircle,
	Plus,
	User as UserIcon,
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { CategoryIcon } from "~/components/category-icon";
import {
	type AccountSection,
	activeTab,
	categoryHref,
	gatedHref,
	helpLinks,
	loginHref,
	type NavRubric,
	type NavTab,
	shopsDirectoryHref,
	showTabBar,
} from "~/lib/nav";
import { cn } from "~/lib/utils";
import { AccountLinksList } from "./account-menu";
import { LocaleSwitcher } from "./locale-switcher";

interface MobileTabBarProps {
	pathname: string | null;
	signedIn: boolean;
	unreadCount: number;
	rubrics: NavRubric[];
	shopsEnabled: boolean;
	account: AccountSection[];
	userLabel: { name: string; email: string } | null;
	onLogout: () => void;
	/** Asks the caller for the tree the first time the categories sheet opens. */
	onWantCategories?: () => void;
}

const tabClass = (on: boolean) =>
	cn(
		"flex h-full flex-col items-center justify-center gap-0.5 text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD] focus-visible:ring-inset",
		on ? "font-bold text-[#1E40AF]" : "text-[#475569]",
	);

/**
 * Mobile web's bottom tab bar (< md), in place of a hamburger. Absent where a
 * page has its own shell (checkout, seller and moderation spaces).
 */
export function MobileTabBar({
	pathname,
	signedIn,
	unreadCount,
	rubrics,
	shopsEnabled,
	account,
	userLabel,
	onLogout,
	onWantCategories,
}: MobileTabBarProps) {
	const t = useTranslations("Nav");
	const [sheet, setSheet] = useState<"categories" | "account" | null>(null);
	if (!showTabBar(pathname)) return null;
	const tab: NavTab | null = sheet ?? activeTab(pathname);

	const openSheet = (which: "categories" | "account") => {
		if (which === "categories") onWantCategories?.();
		setSheet(which);
	};

	return (
		<>
			<nav
				aria-label={t("tabBar")}
				className="fixed inset-x-0 bottom-0 z-40 border-[#E2E8F0] border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
			>
				<ul className="grid h-16 grid-cols-5">
					<li>
						<Link
							href="/"
							aria-current={tab === "home" ? "page" : undefined}
							className={tabClass(tab === "home")}
						>
							<Home aria-hidden="true" className="h-5 w-5" />
							{t("tabHome")}
						</Link>
					</li>
					<li>
						<button
							type="button"
							aria-haspopup="dialog"
							aria-expanded={sheet === "categories"}
							onClick={() => openSheet("categories")}
							className={cn("w-full", tabClass(tab === "categories"))}
						>
							<LayoutGrid aria-hidden="true" className="h-5 w-5" />
							{t("tabCategories")}
						</button>
					</li>
					<li>
						<Link
							href={gatedHref(signedIn, "/create")}
							aria-current={tab === "publish" ? "page" : undefined}
							className="flex h-full flex-col items-center justify-center gap-0.5 font-extrabold text-[#0F172A] text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD] focus-visible:ring-inset"
						>
							<span className="-mt-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#F59E0B] shadow-[0_4px_10px_rgba(245,158,11,0.35)]">
								<Plus aria-hidden="true" className="h-6 w-6" />
							</span>
							{t("tabPublish")}
						</Link>
					</li>
					<li>
						<Link
							href={gatedHref(signedIn, "/messages")}
							aria-current={tab === "messages" ? "page" : undefined}
							className={cn("relative", tabClass(tab === "messages"))}
						>
							<span className="relative">
								<MessageCircle aria-hidden="true" className="h-5 w-5" />
								{unreadCount > 0 && (
									<span className="-top-1.5 -right-2.5 absolute flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 font-bold text-[10px] text-white">
										{unreadCount > 99 ? "99+" : unreadCount}
									</span>
								)}
							</span>
							{t("tabMessages")}
							{unreadCount > 0 && (
								<span className="sr-only">
									{t("unread", { count: unreadCount })}
								</span>
							)}
						</Link>
					</li>
					<li>
						<button
							type="button"
							aria-haspopup="dialog"
							aria-expanded={sheet === "account"}
							onClick={() => openSheet("account")}
							className={cn("w-full", tabClass(tab === "account"))}
						>
							<UserIcon aria-hidden="true" className="h-5 w-5" />
							{t("tabAccount")}
						</button>
					</li>
				</ul>
			</nav>

			<Sheet
				open={sheet === "categories"}
				onClose={() => setSheet(null)}
				title={t("tabCategories")}
			>
				<CategoriesSheetBody
					rubrics={rubrics}
					shopsEnabled={shopsEnabled}
					onNavigate={() => setSheet(null)}
				/>
			</Sheet>
			<Sheet
				open={sheet === "account"}
				onClose={() => setSheet(null)}
				title={t("tabAccount")}
			>
				<AccountSheetBody
					signedIn={signedIn}
					pathname={pathname}
					account={account}
					userLabel={userLabel}
					onLogout={() => {
						setSheet(null);
						onLogout();
					}}
					onNavigate={() => setSheet(null)}
				/>
			</Sheet>
		</>
	);
}

/** Keeps page content clear of the fixed tab bar where the bar shows. */
export function TabBarSpacer() {
	const pathname = usePathname();
	if (!showTabBar(pathname)) return null;
	return (
		<div
			aria-hidden="true"
			className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden"
		/>
	);
}

function Sheet({
	open,
	onClose,
	title,
	children,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
}) {
	const t = useTranslations("Nav");
	return (
		<DialogPrimitive.Root
			open={open}
			onOpenChange={(next) => !next && onClose()}
		>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Content
					aria-describedby={undefined}
					className="fixed inset-0 z-50 flex flex-col bg-[#F8FAFC] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:hidden"
				>
					<div className="flex h-14 shrink-0 items-center justify-between border-[#E2E8F0] border-b bg-white px-4">
						<DialogPrimitive.Title className="font-bold font-heading text-[#0F172A] text-lg">
							{title}
						</DialogPrimitive.Title>
						<DialogPrimitive.Close
							aria-label={t("close")}
							className="flex h-9 w-9 items-center justify-center rounded-lg text-[#475569] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD]"
						>
							<X aria-hidden="true" className="h-5 w-5" />
						</DialogPrimitive.Close>
					</div>
					<div className="flex-1 overflow-y-auto p-4">{children}</div>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}

/** Top-level rubrics first, a tap drills into one; Boutiques sits apart at the end. */
export function CategoriesSheetBody({
	rubrics,
	shopsEnabled,
	onNavigate,
	initialRubric = null,
}: {
	rubrics: NavRubric[];
	shopsEnabled: boolean;
	onNavigate?: () => void;
	initialRubric?: string | null;
}) {
	const t = useTranslations("Nav");
	const [openId, setOpenId] = useState<string | null>(initialRubric);
	const rubric = rubrics.find((r) => r.id === openId) ?? null;
	const row =
		"flex w-full items-center justify-between px-4 py-3 text-left text-[#0F172A] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD] focus-visible:ring-inset";

	if (rubric) {
		return (
			<div>
				<button
					type="button"
					onClick={() => setOpenId(null)}
					className="mb-3 flex items-center gap-1 rounded font-semibold text-[#1E40AF] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD]"
				>
					<ChevronLeft aria-hidden="true" className="h-4 w-4" />
					{t("backToCategories")}
				</button>
				<h3 className="mb-2 px-1 font-bold font-heading text-[#0F172A] text-base">
					{rubric.name}
				</h3>
				<ul className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
					<li className="border-[#E2E8F0] border-b">
						<Link
							href={categoryHref(rubric.id)}
							onClick={onNavigate}
							className={cn(row, "font-semibold text-[#1E40AF]")}
						>
							{t("allOf", { name: rubric.name })}
							<ChevronRight aria-hidden="true" className="h-4 w-4" />
						</Link>
					</li>
					{rubric.children.map((child) => (
						<li
							key={child.id}
							className="border-[#E2E8F0] border-b last:border-b-0"
						>
							<Link
								href={categoryHref(child.id)}
								onClick={onNavigate}
								className={row}
							>
								<span className="flex min-w-0 items-center gap-3">
									<CategoryIcon
										category={child}
										imageUrl={child.imageUrl}
										size={28}
										decorative
										className="shrink-0"
									/>
									<span className="truncate">{child.name}</span>
								</span>
								<ChevronRight
									aria-hidden="true"
									className="h-4 w-4 text-[#94A3B8]"
								/>
							</Link>
						</li>
					))}
				</ul>
				{shopsEnabled && (
					<Link
						href={shopsDirectoryHref({ category: rubric.id })}
						onClick={onNavigate}
						className="mt-3 block rounded px-1 font-semibold text-[#1E40AF] text-sm hover:underline"
					>
						{t("shopsOf", { name: rubric.name })}
					</Link>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<ul className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
				{rubrics.length === 0 && (
					<li className="px-4 py-3 text-[#64748B] text-sm">{t("loading")}</li>
				)}
				{rubrics.map((r) => (
					<li key={r.id} className="border-[#E2E8F0] border-b last:border-b-0">
						{r.children.length > 0 ? (
							<button
								type="button"
								onClick={() => setOpenId(r.id)}
								className={row}
							>
								<span className="flex min-w-0 items-center gap-3">
									<CategoryIcon
										category={r}
										imageUrl={r.imageUrl}
										size={32}
										decorative
										className="shrink-0"
									/>
									<span className="truncate">{r.name}</span>
								</span>
								<ChevronRight
									aria-hidden="true"
									className="h-4 w-4 text-[#94A3B8]"
								/>
							</button>
						) : (
							<Link
								href={categoryHref(r.id)}
								onClick={onNavigate}
								className={row}
							>
								<span className="flex min-w-0 items-center gap-3">
									<CategoryIcon
										category={r}
										imageUrl={r.imageUrl}
										size={32}
										decorative
										className="shrink-0"
									/>
									<span className="truncate">{r.name}</span>
								</span>
								<ChevronRight
									aria-hidden="true"
									className="h-4 w-4 text-[#94A3B8]"
								/>
							</Link>
						)}
					</li>
				))}
			</ul>
			{shopsEnabled && (
				<ul className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
					<li>
						<Link
							href={shopsDirectoryHref({ verified: true })}
							onClick={onNavigate}
							className={cn(row, "font-semibold")}
						>
							{t("verifiedShops")}
							<ChevronRight
								aria-hidden="true"
								className="h-4 w-4 text-[#94A3B8]"
							/>
						</Link>
					</li>
				</ul>
			)}
		</div>
	);
}

/** Signed in: the grouped account links. Signed out: sign-in first. Help and language either way. */
export function AccountSheetBody({
	signedIn,
	pathname,
	account,
	userLabel,
	onLogout,
	onNavigate,
}: {
	signedIn: boolean;
	pathname: string | null;
	account: AccountSection[];
	userLabel: { name: string; email: string } | null;
	onLogout: () => void;
	onNavigate?: () => void;
}) {
	const t = useTranslations("Nav");
	const back = pathname ?? "/";
	return (
		<div className="space-y-5">
			{signedIn ? (
				<>
					{userLabel && (
						<div className="px-1">
							<p className="font-semibold text-[#0F172A]">{userLabel.name}</p>
							<p className="text-[#64748B] text-xs">{userLabel.email}</p>
						</div>
					)}
					<AccountLinksList sections={account} onNavigate={onNavigate} />
				</>
			) : (
				<Link
					href={loginHref(back)}
					onClick={onNavigate}
					className="flex h-11 items-center justify-center rounded-lg bg-[#1E40AF] font-semibold text-sm text-white"
				>
					{t("logIn")}
				</Link>
			)}
			<section aria-label={t("help")}>
				<h3 className="mb-1.5 px-1 font-bold text-[#94A3B8] text-[10px] uppercase tracking-widest">
					{t("help")}
				</h3>
				<ul className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
					{helpLinks().map((link) => (
						<li
							key={link.key}
							className="border-[#E2E8F0] border-b last:border-b-0"
						>
							<Link
								href={link.href}
								onClick={onNavigate}
								className="flex items-center justify-between px-4 py-3 text-[#0F172A] text-sm"
							>
								{t(link.key)}
								<ChevronRight
									aria-hidden="true"
									className="h-4 w-4 text-[#94A3B8]"
								/>
							</Link>
						</li>
					))}
				</ul>
			</section>
			<div className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-white px-2">
				<span className="px-2 text-[#0F172A] text-sm">{t("language")}</span>
				<LocaleSwitcher />
			</div>
			{signedIn && (
				<button
					type="button"
					onClick={onLogout}
					className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white py-3 font-semibold text-[#DC2626] text-sm"
				>
					<LogOut aria-hidden="true" className="h-4 w-4" />
					{t("logOut")}
				</button>
			)}
		</div>
	);
}
