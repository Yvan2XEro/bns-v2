"use client";

import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";
import type { InboxFilter } from "~/types";

const FILTERS: InboxFilter[] = [
	"all",
	"unassigned",
	"mine",
	"unread",
	"awaiting",
	"done",
];

const LABEL_KEY: Record<InboxFilter, string> = {
	all: "filterAll",
	unassigned: "filterUnassigned",
	mine: "filterMine",
	unread: "filterUnread",
	awaiting: "filterAwaiting",
	done: "filterDone",
};

export function FilterList({
	filter,
	totals,
	onChange,
}: {
	filter: InboxFilter;
	totals: Record<InboxFilter, number> | undefined;
	onChange: (filter: InboxFilter) => void;
}) {
	const t = useTranslations("Inbox");

	return (
		<div
			role="tablist"
			aria-label={t("title")}
			className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible"
		>
			{FILTERS.map((value) => {
				const active = value === filter;
				const total = totals?.[value] ?? 0;
				return (
					<button
						key={value}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(value)}
						className={cn(
							"flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left font-medium text-sm",
							active
								? "bg-[#EFF6FF] text-[#1E40AF]"
								: "text-[#334155] hover:bg-[#F8FAFC]",
						)}
					>
						<span>{t(LABEL_KEY[value])}</span>
						<span
							className={cn(
								"rounded-full px-1.5 text-[11px]",
								active
									? "bg-[#DBEAFE] text-[#1E40AF]"
									: "bg-[#F1F5F9] text-[#64748B]",
							)}
						>
							{total}
						</span>
					</button>
				);
			})}
		</div>
	);
}
