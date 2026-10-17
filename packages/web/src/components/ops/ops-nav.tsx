"use client";

import {
	Flag,
	Inbox,
	type LucideIcon,
	Scale,
	ScrollText,
	ShieldAlert,
	ShieldCheck,
	Store,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	useModerationQueue,
	useModerationSummary,
} from "~/hooks/use-moderation-console";
import {
	isSectionActive,
	OPS_SECTIONS,
	type OpsSection,
	sectionCount,
} from "~/lib/moderation-console";
import { cn } from "~/lib/utils";

const ICONS: Record<OpsSection, LucideIcon> = {
	queue: Inbox,
	reports: Flag,
	verification: ShieldCheck,
	disputes: Scale,
	risk: ShieldAlert,
	shops: Store,
	log: ScrollText,
};

const BADGE: Partial<Record<OpsSection, string>> = {
	queue: "bg-amber-500 text-slate-900",
	reports: "bg-slate-700 text-white",
	verification: "bg-blue-900 text-blue-200",
	disputes: "bg-orange-900 text-orange-200",
	risk: "bg-red-900 text-red-200",
};

/** The moderation sidebar's sections with their live counts, the current one highlighted. */
export function OpsNav() {
	const t = useTranslations("ModerationConsole");
	const pathname = usePathname();
	const summary = useModerationSummary();
	const queue = useModerationQueue({});
	const queueTotal = queue.data?.pages[0]?.total;

	return (
		<nav
			aria-label={t("nav.label")}
			className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col"
		>
			{OPS_SECTIONS.map(({ key, href }) => {
				const active = isSectionActive(pathname, href);
				const Icon = ICONS[key];
				const count = sectionCount(key, summary.data, queueTotal);
				return (
					<Link
						key={key}
						href={href}
						aria-current={active ? "page" : undefined}
						className={cn(
							"flex h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 font-medium text-sm focus-visible:outline-2 focus-visible:outline-blue-400",
							active
								? "bg-[#1E293B] font-semibold text-white"
								: "text-[#CBD5E1] hover:bg-white/5 hover:text-white",
						)}
					>
						<Icon aria-hidden="true" className="h-4 w-4" />
						{t(`nav.${key}`)}
						{count ? (
							<span
								className={cn(
									"ml-auto flex h-5 min-w-[22px] items-center justify-center rounded-full px-1.5 font-bold text-[11px] tabular-nums",
									BADGE[key] ?? "bg-slate-700 text-white",
								)}
							>
								{count}
							</span>
						) : null}
					</Link>
				);
			})}
		</nav>
	);
}
