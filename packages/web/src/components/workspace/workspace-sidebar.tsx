"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LocaleSwitcher } from "~/components/layout/locale-switcher";
import { ThemeSwitcher } from "~/components/layout/theme-switcher";
import { cn } from "~/lib/utils";

/**
 * The dark sidebar every workspace (seller space, moderation) is built on:
 * a header, optional notices, the navigation, then the exits and the
 * language and theme switches. A shop's colour reaches it through the
 * `--shop-sidebar-*` variables; without one it keeps the platform's slate.
 *
 * One frame for both spaces, so a change here reaches both.
 */

const COUNT =
	"ml-auto flex h-5 min-w-[22px] items-center justify-center rounded-[10px] px-1.5 font-bold text-[11px] tabular-nums";

export interface WorkspaceExit {
	href: string;
	label: string;
	icon: LucideIcon;
	/** The "leave this space" exit is highlighted. */
	highlight?: boolean;
}

export function WorkspaceSidebar({
	header,
	notices,
	navLabel,
	children,
	exits,
	footerNote,
}: {
	header: ReactNode;
	notices?: ReactNode;
	navLabel?: string;
	/** The navigation entries, usually `WorkspaceNavLink`s. */
	children: ReactNode;
	exits: WorkspaceExit[];
	/** A short note above the exits (large screens only). */
	footerNote?: ReactNode;
}) {
	return (
		<aside className="flex flex-col border-[var(--shop-sidebar-raised,#1E293B)] border-b bg-[var(--shop-sidebar-bg,#0F172A)] lg:sticky lg:top-0 lg:h-screen lg:w-[248px] lg:shrink-0 lg:border-r lg:border-b-0">
			{header}
			{notices}
			<nav
				aria-label={navLabel}
				className="flex gap-0.5 overflow-x-auto p-3 lg:flex-col lg:overflow-y-auto"
			>
				{children}
				{/* Below lg the footer is hidden: its exits ride at the end of the strip. */}
				<span
					aria-hidden="true"
					className="mx-1 my-2 w-px shrink-0 bg-white/10 lg:hidden"
				/>
				{exits.map((exit) => (
					<ExitLink key={exit.href} exit={exit} className="lg:hidden" />
				))}
			</nav>
			<div className="mt-auto hidden flex-col gap-0.5 border-[var(--shop-sidebar-raised,#1E293B)] border-t p-3 lg:flex">
				{footerNote}
				{exits.map((exit) => (
					<ExitLink key={exit.href} exit={exit} />
				))}
				<div className="flex items-center justify-between gap-2">
					<LocaleSwitcher tone="dark" className="h-10 px-3 text-sm" />
					<ThemeSwitcher tone="dark" className="mr-2" />
				</div>
			</div>
		</aside>
	);
}

function ExitLink({
	exit,
	className,
}: {
	exit: WorkspaceExit;
	className?: string;
}) {
	const Icon = exit.icon;
	return (
		<Link
			href={exit.href}
			className={cn(
				"flex h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 font-medium text-sm hover:bg-white/5",
				exit.highlight ? "text-[#FCD34D]" : "text-[#CBD5E1] hover:text-white",
				className,
			)}
		>
			<Icon aria-hidden="true" className="h-[18px] w-[18px]" />
			{exit.label}
		</Link>
	);
}

/** A group heading inside the navigation (a divider below lg). */
export function WorkspaceNavGroup({ label }: { label: string }) {
	return (
		<>
			<span className="hidden px-3 pt-4 pb-1 font-semibold text-[#64748B] text-[11px] uppercase tracking-wider lg:block">
				{label}
			</span>
			<span
				aria-hidden="true"
				className="mx-1 my-2 w-px shrink-0 bg-white/10 lg:hidden"
			/>
		</>
	);
}

export function WorkspaceNavLink({
	href,
	icon: Icon,
	label,
	active,
	count,
	countClassName,
	countTitle,
}: {
	href: string;
	icon: LucideIcon;
	label: string;
	active: boolean;
	/** Shown only when truthy (a number above 0, or a short text). */
	count?: number | string | null;
	countClassName?: string;
	countTitle?: string;
}) {
	return (
		<Link
			href={href}
			aria-current={active ? "page" : undefined}
			className={cn(
				"flex h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 font-medium text-sm focus-visible:outline-2 focus-visible:outline-blue-400",
				active
					? "bg-[var(--shop-sidebar-raised,#1E293B)] font-semibold text-white"
					: "text-[#CBD5E1] hover:bg-white/5 hover:text-white",
			)}
		>
			<Icon aria-hidden="true" className="h-[18px] w-[18px]" />
			<span className="flex-1">{label}</span>
			{count ? (
				<span
					className={cn(COUNT, countClassName ?? "bg-[#334155] text-white")}
					title={countTitle}
				>
					{count}
				</span>
			) : null}
		</Link>
	);
}
