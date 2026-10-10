"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "~/lib/utils";

export function SectionTabs({
	tabs,
}: {
	tabs: Array<{ href: string; label: string; exact?: boolean }>;
}) {
	const pathname = usePathname();
	return (
		<div className="mb-6 flex gap-1 border-[#E2E8F0] border-b">
			{tabs.map((tab) => {
				const active = tab.exact
					? pathname === tab.href
					: pathname === tab.href || pathname.startsWith(`${tab.href}/`);
				return (
					<Link
						key={tab.href}
						href={tab.href}
						aria-current={active ? "page" : undefined}
						className={cn(
							"px-3 py-2 font-medium text-sm",
							active
								? "-mb-px border-[#1E40AF] border-b-2 text-[#1E40AF]"
								: "text-[#64748B] hover:text-[#0F172A]",
						)}
					>
						{tab.label}
					</Link>
				);
			})}
		</div>
	);
}
