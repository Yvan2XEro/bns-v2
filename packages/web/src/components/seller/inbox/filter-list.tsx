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
								? "bg-[var(--shop-accent-soft,var(--c-brand-soft))] text-[var(--shop-accent-text,var(--c-brand))]"
								: "text-ink-soft hover:bg-canvas",
						)}
					>
						<span>{t(LABEL_KEY[value])}</span>
						<span
							className={cn(
								"rounded-full px-1.5 text-[11px]",
								active
									? "bg-[var(--shop-accent-soft,var(--c-brand-tint))] text-[var(--shop-accent-text,var(--c-brand))]"
									: "bg-subtle text-ink-muted",
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
