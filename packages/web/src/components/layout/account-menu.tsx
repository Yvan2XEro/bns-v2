"use client";

import { ChevronDown, ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import type { AccountSection } from "~/lib/nav";
import { cn } from "~/lib/utils";
import type { User } from "~/types";

type MenuUser = Pick<User, "name" | "email" | "avatar">;

export function UserAvatar({
	user,
	className,
}: {
	user: MenuUser;
	className?: string;
}) {
	return (
		<Avatar className={cn("h-7 w-7", className)}>
			<AvatarImage src={(user.avatar as { url?: string } | null)?.url} alt="" />
			<AvatarFallback className="bg-[#1E40AF] font-semibold text-white text-xs">
				{user.name?.charAt(0)}
			</AvatarFallback>
		</Avatar>
	);
}

/** Desktop account menu: Achats, Ventes, then profile, help and sign-out. */
export function AccountMenu({
	user,
	sections,
	onLogout,
	themed = false,
}: {
	user: MenuUser;
	sections: AccountSection[];
	onLogout: () => void;
	themed?: boolean;
}) {
	const t = useTranslations("Nav");
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={cn(
					"flex h-10 items-center gap-1.5 rounded-lg px-1.5 text-xs focus-visible:outline-none focus-visible:ring-2",
					themed
						? "text-[var(--shop-head-fg)] hover:bg-white/10 focus-visible:ring-[var(--shop-head-fg)] data-[state=open]:bg-[var(--shop-head-accent)] data-[state=open]:text-[var(--shop-head-on-accent)]"
						: "text-[#475569] hover:bg-[#F1F5F9] focus-visible:ring-[#93C5FD] data-[state=open]:bg-[#EFF6FF] data-[state=open]:text-[#1E40AF]",
				)}
			>
				<UserAvatar user={user} />
				<span className="sr-only xl:not-sr-only">{t("account")}</span>
				<ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-72 rounded-xl border-[#E2E8F0] bg-white p-1.5 text-[#0F172A]"
			>
				<DropdownMenuLabel className="font-normal">
					<p className="font-semibold text-sm">{user.name}</p>
					<p className="truncate text-[#64748B] text-xs">{user.email}</p>
				</DropdownMenuLabel>
				<DropdownMenuSeparator className="bg-[#E2E8F0]" />
				{sections.map((section, index) => (
					<Fragment key={section.heading ?? `block-${index}`}>
						{section.heading === null && (
							<DropdownMenuSeparator className="bg-[#E2E8F0]" />
						)}
						<DropdownMenuGroup>
							{section.heading && (
								<DropdownMenuLabel className="px-2 pt-2 pb-0.5 font-bold text-[#94A3B8] text-[10px] uppercase tracking-widest">
									{t(section.heading)}
								</DropdownMenuLabel>
							)}
							{section.links.map((link) => (
								<DropdownMenuItem
									key={link.key}
									asChild
									className="cursor-pointer rounded-lg"
								>
									<Link href={link.href}>
										<span className="flex-1">
											{t(link.key)}
											{link.detail && (
												<span className="text-[#64748B]"> · {link.detail}</span>
											)}
										</span>
									</Link>
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					</Fragment>
				))}
				<DropdownMenuItem
					onSelect={onLogout}
					className="cursor-pointer rounded-lg text-[#DC2626] focus:text-[#DC2626]"
				>
					<LogOut aria-hidden="true" className="h-4 w-4" />
					{t("logOut")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** The same groups as a plain list, for the mobile Compte sheet. */
export function AccountLinksList({
	sections,
	onNavigate,
}: {
	sections: AccountSection[];
	onNavigate?: () => void;
}) {
	const t = useTranslations("Nav");
	return (
		<div className="space-y-4">
			{sections.map((section, index) => (
				<section
					key={section.heading ?? `block-${index}`}
					aria-label={section.heading ? t(section.heading) : undefined}
				>
					{section.heading && (
						<h3 className="mb-1.5 px-1 font-bold text-[#94A3B8] text-[10px] uppercase tracking-widest">
							{t(section.heading)}
						</h3>
					)}
					<ul className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
						{section.links.map((link) => (
							<li
								key={link.key}
								className="border-[#E2E8F0] border-b last:border-b-0"
							>
								<Link
									href={link.href}
									onClick={onNavigate}
									className="flex items-center justify-between px-4 py-3 text-[#0F172A] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD] focus-visible:ring-inset"
								>
									<span>
										{t(link.key)}
										{link.detail && (
											<span className="text-[#64748B]"> · {link.detail}</span>
										)}
									</span>
									<ChevronRight
										aria-hidden="true"
										className="h-4 w-4 text-[#94A3B8]"
									/>
								</Link>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}
