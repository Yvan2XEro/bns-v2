"use client";

import { useLocale, useTranslations } from "next-intl";
import { useModerationDisputeAction } from "~/hooks/use-moderation-disputes";
import { resolveErrorMessage } from "~/lib/apiError";
import { revokeAction } from "~/lib/moderation-dispute-notes";
import type { ShopStandingView } from "../../../../api/src/contracts/disputes";
import { ConfirmNoteAction } from "./dispute-confirm-note";

type Strike = ShopStandingView["strikes"][number];

export function StrikeRow({
	strike,
	canRevoke,
	disputeId,
}: {
	strike: Strike;
	canRevoke: boolean;
	disputeId: string;
}) {
	const t = useTranslations("ModerationDisputes");
	const tRoot = useTranslations();
	const locale = useLocale();
	const action = useModerationDisputeAction(disputeId);
	return (
		<li data-status={strike.status} className="rounded-lg bg-[#F8FAFC] p-2">
			<p>
				<span className="font-medium">{t(`strikeKind.${strike.kind}`)}</span> ·{" "}
				{t(`strikeStatus.${strike.status}`)}
			</p>
			<p className="text-[#64748B] text-xs">
				{t("strikeWeight", { weight: strike.weight })}
				{strike.expiresAt
					? ` · ${t("strikeExpires", {
							date: new Intl.DateTimeFormat(locale, {
								dateStyle: "medium",
							}).format(new Date(strike.expiresAt)),
						})}`
					: ""}
			</p>
			{canRevoke && strike.status === "active" ? (
				<div className="mt-1">
					<ConfirmNoteAction
						label={t("revokeStrike")}
						noteLabel={t("revokeNoteLabel")}
						confirmLabel={t("revokeConfirm")}
						pending={action.isPending}
						onConfirm={(note, done) =>
							action.mutate(revokeAction(strike.id, note), {
								onSuccess: done,
							})
						}
					/>
					{action.isError ? (
						<p role="alert" className="mt-1 text-red-700 text-xs">
							{resolveErrorMessage(action.error, tRoot)}
						</p>
					) : null}
				</div>
			) : null}
		</li>
	);
}

/** Revocation is admin-only on the server; the control is hidden for moderators. */
export function DisputeStrikes({
	disputeId,
	strikes,
	viewerIsAdmin,
}: {
	disputeId: string;
	strikes: Strike[];
	viewerIsAdmin: boolean;
}) {
	const t = useTranslations("ModerationDisputes");
	return (
		<section className="space-y-2 rounded-xl border border-[#E2E8F0] bg-white p-4 text-sm">
			<h2 className="font-semibold">{t("strikesTitle")}</h2>
			{strikes.length ? (
				<ul className="space-y-2">
					{strikes.map((strike) => (
						<StrikeRow
							key={strike.id}
							strike={strike}
							canRevoke={viewerIsAdmin}
							disputeId={disputeId}
						/>
					))}
				</ul>
			) : (
				<p className="text-[#64748B]">{t("noStrikes")}</p>
			)}
		</section>
	);
}
