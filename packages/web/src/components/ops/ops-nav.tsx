"use client";

import {
	ArrowLeftRight,
	Flag,
	Inbox,
	type LucideIcon,
	Scale,
	ScrollText,
	ShieldAlert,
	ShieldCheck,
	Store,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	WorkspaceNavLink,
	WorkspaceSidebar,
} from "~/components/workspace/workspace-sidebar";
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

/**
 * The moderation sidebar: the shared workspace frame (the seller space uses
 * the same one) with the sections and their live counts, the audit notice,
 * and the way back to the marketplace.
 */
export function OpsSidebar() {
	const t = useTranslations("ModerationConsole");
	const tShell = useTranslations("Moderation.shell");
	const pathname = usePathname() ?? "/moderation";
	const summary = useModerationSummary();
	const queue = useModerationQueue({});
	const queueTotal = queue.data?.pages[0]?.total;

	return (
		<WorkspaceSidebar
			header={
				<div className="p-4">
					<p className="font-bold font-heading text-sm text-white">
						{tShell("title")}
					</p>
					<p className="text-[#94A3B8] text-xs">{tShell("subtitle")}</p>
				</div>
			}
			navLabel={t("nav.label")}
			footerNote={
				<p className="mb-2 rounded-lg bg-white/5 p-3 text-[#CBD5E1] text-xs">
					{tShell("auditNotice")}
				</p>
			}
			exits={[
				{
					href: "/",
					label: tShell("backToSite"),
					icon: ArrowLeftRight,
					highlight: true,
				},
			]}
		>
			{OPS_SECTIONS.map(({ key, href }) => (
				<WorkspaceNavLink
					key={key}
					href={href}
					icon={ICONS[key]}
					label={t(`nav.${key}`)}
					active={isSectionActive(pathname, href)}
					count={sectionCount(key, summary.data, queueTotal)}
					countClassName={BADGE[key]}
				/>
			))}
		</WorkspaceSidebar>
	);
}
