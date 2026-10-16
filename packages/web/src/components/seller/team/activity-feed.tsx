"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useShopActivity } from "~/hooks/use-shop-activity";
import { activityLabelKey } from "~/lib/shop-activity";
import { timeAgo } from "~/lib/time-ago";

const FEED_SIZE = 6;

/** The latest few log entries beside the roster; the full log keeps its own page. */
export function ActivityFeed({ shopId }: { shopId: string }) {
	const tPage = useTranslations("TeamPage");
	const tActivity = useTranslations("shopActivity");
	const tRoot = useTranslations();
	const locale = useLocale();
	const query = useShopActivity(shopId);
	const entries = (query.data?.pages[0]?.docs ?? []).slice(0, FEED_SIZE);

	return (
		<section
			aria-labelledby="team-activity-title"
			className="overflow-hidden rounded-2xl border border-line bg-surface"
		>
			<div className="flex items-center justify-between gap-2 border-subtle border-b px-[18px] py-3.5">
				<h2 id="team-activity-title" className="font-bold text-base text-ink">
					{tPage("activityTitle")}
				</h2>
				<Link
					href="/seller/team/activity"
					className="font-semibold text-[13px] text-[var(--shop-accent-text,var(--c-brand))] hover:underline"
				>
					{tPage("seeAll")}
				</Link>
			</div>
			{query.isPending ? (
				<div className="space-y-2 p-[18px]">
					{[0, 1, 2].map((row) => (
						<div key={row} className="h-9 animate-pulse rounded-lg bg-subtle" />
					))}
				</div>
			) : query.isError ? (
				<p role="alert" className="px-[18px] py-4 text-ink-muted text-sm">
					{tPage("activityError")}
				</p>
			) : entries.length === 0 ? (
				<p className="px-[18px] py-4 text-ink-muted text-sm">
					{tActivity("empty")}
				</p>
			) : (
				<ul>
					{entries.map((entry) => (
						<li
							key={entry.id}
							className="border-subtle border-b px-[18px] py-[11px] last:border-0"
						>
							<p className="text-[13px] text-ink-soft leading-[18px]">
								<strong className="text-ink">
									{entry.actor?.name ?? tActivity("roles.system")}
								</strong>{" "}
								· {tRoot(activityLabelKey(entry.action))}
							</p>
							<p className="text-ink-faint text-xs">
								{timeAgo(entry.createdAt, locale, { maxDays: 30 })}
							</p>
						</li>
					))}
				</ul>
			)}
			<p className="bg-canvas px-[18px] py-2.5 text-ink-faint text-xs">
				{tPage("activityFootnote")}
			</p>
		</section>
	);
}
