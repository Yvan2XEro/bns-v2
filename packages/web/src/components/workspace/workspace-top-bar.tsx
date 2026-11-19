"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AccountMenu } from "~/components/layout/account-menu";
import { LocaleSwitcher } from "~/components/layout/locale-switcher";
import { useAppConfig } from "~/hooks/use-app-config";
import { useAuth } from "~/hooks/use-auth";
import { isModerator } from "~/lib/moderation-verification";
import { accountSections } from "~/lib/nav";
import { useWorkspacePageMeta } from "./page-meta";

export interface Crumb {
	label: string;
	href?: string;
}

/**
 * The top bar every workspace (seller space, moderation) shares, in view on
 * every page: where you are (the trail, ending on what the open page set
 * through `WorkspacePageMeta`), the space's own shortcuts, the alerts and the
 * account menu (profile, the other spaces you can enter, sign-out).
 *
 * One bar for both spaces, so a change here reaches both.
 */
export function WorkspaceTopBar({
	crumbs,
	actions,
	bell,
	shopEntry,
}: {
	/** The trail before the open page's own reference. */
	crumbs: Crumb[];
	/** This space's shortcuts, before the alerts. */
	actions?: ReactNode;
	/** The alerts inbox, rendered by the server shell. */
	bell: ReactNode;
	shopEntry: { href: "/seller" | "/shop/new"; shopName?: string } | null;
}) {
	const t = useTranslations("SellerShell");
	const router = useRouter();
	const { user, logout } = useAuth();
	const { ordersEnabled } = useAppConfig();
	const page = useWorkspacePageMeta();

	// Once a detail page is open, the section links back to its list (the
	// first crumb, the space itself, keeps its own link).
	const trail: Crumb[] = page
		? [
				...crumbs.map((crumb, index) =>
					index > 0 && index === crumbs.length - 1
						? { label: crumb.label, href: page.sectionHref ?? crumb.href }
						: crumb,
				),
				{ label: page.reference },
			]
		: crumbs;

	return (
		<div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-line border-b bg-surface/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80 lg:px-6">
			<nav
				aria-label={t("whereAmI")}
				className="hidden min-w-0 flex-1 items-center gap-1.5 text-sm md:flex"
			>
				{trail.map((crumb, index) => {
					const last = index === trail.length - 1;
					return (
						<span
							key={`${index}-${crumb.label}`}
							className="flex min-w-0 items-center gap-1.5"
						>
							{index > 0 && (
								<span aria-hidden="true" className="text-ink-faint">
									›
								</span>
							)}
							{last ? (
								<span className="truncate font-semibold text-ink">
									{crumb.label}
								</span>
							) : crumb.href ? (
								<Link
									href={crumb.href}
									className="truncate text-ink-muted hover:text-ink"
								>
									{crumb.label}
								</Link>
							) : (
								<span className="truncate text-ink-muted">{crumb.label}</span>
							)}
						</span>
					);
				})}
				{page?.details?.length ? (
					<span className="hidden shrink-0 truncate pl-2 text-ink-muted text-xs xl:inline">
						{page.details.join(" · ")}
					</span>
				) : null}
			</nav>

			<div className="ml-auto flex items-center gap-1.5">
				{actions}
				{bell}
				<div className="lg:hidden">
					<LocaleSwitcher />
				</div>
				{user && (
					<AccountMenu
						user={user}
						sections={accountSections({
							ordersEnabled,
							shopEntry,
							moderation: isModerator(user),
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
