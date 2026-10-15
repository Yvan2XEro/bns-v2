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
			className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white"
		>
			<div className="flex items-center justify-between gap-2 border-[#F1F5F9] border-b px-[18px] py-3.5">
				<h2
					id="team-activity-title"
					className="font-bold text-[#0F172A] text-base"
				>
					{tPage("activityTitle")}
				</h2>
				<Link
					href="/seller/team/activity"
					className="font-semibold text-[#1E40AF] text-[13px] hover:underline"
				>
					{tPage("seeAll")}
				</Link>
			</div>
			{query.isPending ? (
				<div className="space-y-2 p-[18px]">
					{[0, 1, 2].map((row) => (
						<div
							key={row}
							className="h-9 animate-pulse rounded-lg bg-[#F1F5F9]"
						/>
					))}
				</div>
			) : query.isError ? (
				<p role="alert" className="px-[18px] py-4 text-[#64748B] text-sm">
					{tPage("activityError")}
				</p>
			) : entries.length === 0 ? (
				<p className="px-[18px] py-4 text-[#64748B] text-sm">
					{tActivity("empty")}
				</p>
			) : (
				<ul>
					{entries.map((entry) => (
						<li
							key={entry.id}
							className="border-[#F1F5F9] border-b px-[18px] py-[11px] last:border-0"
						>
							<p className="text-[#334155] text-[13px] leading-[18px]">
								<strong className="text-[#0F172A]">
									{entry.actor?.name ?? tActivity("roles.system")}
								</strong>{" "}
								· {tRoot(activityLabelKey(entry.action))}
							</p>
							<p className="text-[#94A3B8] text-xs">
								{timeAgo(entry.createdAt, locale, { maxDays: 30 })}
							</p>
						</li>
					))}
				</ul>
			)}
			<p className="bg-[#F8FAFC] px-[18px] py-2.5 text-[#94A3B8] text-xs">
				{tPage("activityFootnote")}
			</p>
		</section>
	);
}
