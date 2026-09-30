"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LevelBadge } from "~/components/shop/level-badge";
import {
	canOpenRequest,
	formatRenewalWindow,
	type ShopVerificationResponse,
} from "~/lib/verification";

const RENEW_HREF: Record<2 | 3, string> = {
	2: "/seller/verification/identity",
	3: "/seller/verification/business",
};

/**
 * The shop's current standing: badge, expiry and — only once the renewal
 * window is actually open — a call to action. `formatRenewalWindow` already
 * hides the boundary once it is past, so a boundary in the future is shown
 * as a date and a passed one is shown as a button instead.
 */
export function VerificationStatusCard({
	view,
}: {
	view: ShopVerificationResponse;
}) {
	const t = useTranslations("Verification");
	const locale = useLocale();
	const level = view.capabilities.effectiveLevel;
	const renewLevel = level === 2 || level === 3 ? level : null;

	const renewableFrom = renewLevel
		? view.renewableFrom[renewLevel === 2 ? "level2" : "level3"]
		: null;
	const upcomingRenewal = renewLevel
		? formatRenewalWindow(view, renewLevel)
		: null;
	const renewalOpen =
		renewLevel !== null &&
		renewableFrom !== null &&
		upcomingRenewal === null &&
		canOpenRequest(view, renewLevel).ok;

	return (
		<div className="rounded-2xl border border-[#DBEAFE] bg-white p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<LevelBadge badge={view.capabilities.badge} />
					{level === 0 && (
						<span className="text-[#64748B] text-sm">
							{t("statusCard.noLevel")}
						</span>
					)}
				</div>
				{renewalOpen && renewLevel && (
					<Link
						href={RENEW_HREF[renewLevel]}
						className="inline-flex h-9 items-center rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
					>
						{t("statusCard.renewCta")}
					</Link>
				)}
			</div>

			{view.levelExpiresAt && (
				<p className="mt-3 text-[#64748B] text-sm">
					{t("statusCard.expiresOn", {
						date: new Date(view.levelExpiresAt).toLocaleDateString(locale, {
							day: "numeric",
							month: "long",
							year: "numeric",
						}),
					})}
				</p>
			)}

			{upcomingRenewal && (
				<p className="mt-1 text-[#64748B] text-sm">
					{t("statusCard.renewableFrom", {
						date: new Date(upcomingRenewal).toLocaleDateString(locale, {
							day: "numeric",
							month: "long",
							year: "numeric",
						}),
					})}
				</p>
			)}
		</div>
	);
}
