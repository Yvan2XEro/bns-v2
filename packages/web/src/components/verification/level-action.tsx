"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { RequestTimeline } from "~/components/verification/request-timeline";
import { ReviewerMessage } from "~/components/verification/reviewer-message";
import {
	buildTimeline,
	type CanOpenRequestResult,
	canOpenRequest,
	type ShopVerificationResponse,
} from "~/lib/verification";

const CONTINUE_HREF: Record<2 | 3, string> = {
	2: "/seller/verification/identity",
	3: "/seller/verification/business",
};

function reasonLine(
	t: (key: string, values?: Record<string, string>) => string,
	locale: string,
	result: CanOpenRequestResult,
): string | null {
	if (result.ok) return null;
	if (result.reason === "cooldown" || result.reason === "notRenewableYet") {
		const date = new Date(result.until).toLocaleDateString(locale, {
			day: "numeric",
			month: "long",
			year: "numeric",
		});
		return t(`action.reason.${result.reason}`, { date });
	}
	return t(`action.reason.${result.reason}`);
}

/** One level's request: its timeline, the reviewer's message, and a link to resume it while it is still open. */
export function LevelRequestCard({
	view,
	level,
}: {
	view: ShopVerificationResponse;
	level: 2 | 3;
}) {
	const t = useTranslations("Verification");
	const request = view.requests[level === 2 ? "level2" : "level3"];
	if (!request) return null;

	const timeline = buildTimeline(request);
	const current = timeline[0];
	const resumable =
		request.status === "draft" || request.status === "needs_info";

	return (
		<div className="rounded-2xl border border-[#DBEAFE] bg-white p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h3 className="font-bold text-[#0F172A] text-base">
					{t(`requestCard.title.${level}`)}
				</h3>
				{resumable && view.enabled && (
					<Link
						href={CONTINUE_HREF[level]}
						className="inline-flex h-9 items-center rounded-lg border border-[#93C5FD] bg-[#EFF6FF] px-4 font-semibold text-[#1E40AF] text-sm hover:bg-[#DBEAFE]"
					>
						{t("requestCard.continue")}
					</Link>
				)}
			</div>
			{current && (
				<div className="mt-3">
					<ReviewerMessage entry={current} />
				</div>
			)}
			<div className="mt-4">
				<RequestTimeline entries={timeline} />
			</div>
		</div>
	);
}

/**
 * The primary action for a level: what `canOpenRequest` allows, or the
 * reason it does not, never a silently dead control. `isOwner` is asked for
 * explicitly rather than inferred from anything being present — a staff
 * member's shop view has every field `canOpenRequest` needs, but only the
 * owner may act on it.
 */
export function LevelAction({
	view,
	level,
	isOwner,
}: {
	view: ShopVerificationResponse;
	level: 2 | 3;
	isOwner: boolean;
}) {
	const t = useTranslations("Verification");
	const locale = useLocale();
	const request = view.requests[level === 2 ? "level2" : "level3"];
	const result = canOpenRequest(view, level);
	const reason = isOwner
		? reasonLine(t, locale, result)
		: t("action.reason.notOwner");
	const allowed = isOwner && result.ok;

	const labelKey = request?.status === "approved" ? "renew" : "start";

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-4">
			<p className="font-medium text-[#0F172A] text-sm">
				{t(`action.label.${labelKey}.${level}`)}
			</p>
			{allowed ? (
				<Link
					href={CONTINUE_HREF[level]}
					className="inline-flex h-9 items-center rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
				>
					{t(`action.cta.${labelKey}`)}
				</Link>
			) : (
				<div className="flex items-center gap-2 text-right">
					<span className="text-[#64748B] text-xs">{reason}</span>
					<button
						type="button"
						disabled
						className="inline-flex h-9 items-center rounded-lg bg-[#E2E8F0] px-4 font-semibold text-[#94A3B8] text-sm"
					>
						{t(`action.cta.${labelKey}`)}
					</button>
				</div>
			)}
		</div>
	);
}
