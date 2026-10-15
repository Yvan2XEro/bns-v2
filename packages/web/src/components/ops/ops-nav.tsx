"use client";

import { type LucideIcon, Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "~/lib/utils";

const ICONS: Record<string, LucideIcon> = {
	"/moderation/verification": ShieldCheck,
	"/moderation/disputes": Scale,
};

/** The moderation sidebar's links, with the current section highlighted. */
export function OpsNav({
	entries,
}: {
	entries: { href: string; label: string }[];
}) {
	const pathname = usePathname();
	return (
		<nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col">
			{entries.map(({ href, label }) => {
				const active = pathname === href || pathname.startsWith(`${href}/`);
				const Icon = ICONS[href];
				return (
					<Link
						key={href}
						href={href}
						aria-current={active ? "page" : undefined}
						className={cn(
							"flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 font-medium text-sm",
							active
								? "bg-white/10 font-semibold text-white"
								: "text-[#CBD5E1] hover:bg-white/5 hover:text-white",
						)}
					>
						{Icon && <Icon aria-hidden="true" className="h-4 w-4" />}
						{label}
					</Link>
				);
			})}
		</nav>
	);
}
