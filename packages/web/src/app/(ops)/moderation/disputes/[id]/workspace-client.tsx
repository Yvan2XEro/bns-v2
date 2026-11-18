"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { DisputeEvidence } from "~/components/moderation/dispute-evidence";
import { RedactMessageControl } from "~/components/moderation/dispute-redact-message";
import { DisputeRequestInfo } from "~/components/moderation/dispute-request-info";
import { DisputeResolveSheet } from "~/components/moderation/dispute-resolve-sheet";
import { DisputeStrikes } from "~/components/moderation/dispute-strikes";
import { Button } from "~/components/ui/button";
import { useAuth } from "~/hooks/use-auth";
import {
	useModerationDispute,
	useModerationDisputeAction,
} from "~/hooks/use-moderation-disputes";
import { useOrderMoney } from "~/hooks/use-order-money";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	DISPUTE_REASON_LABELS,
	DISPUTE_STATUS_LABELS,
} from "~/lib/case-status";

export function WorkspaceClient({ id }: { id: string }) {
	const t = useTranslations("ModerationDisputes");
	const formatOrderMoney = useOrderMoney();
	const tRoot = useTranslations();
	const locale = useLocale();
	const { user } = useAuth();
	const query = useModerationDispute(id);
	const action = useModerationDisputeAction(id);
	const [resolving, setResolving] = useState(false);

	if (query.isPending) {
		return (
			<output
				aria-label={t("loading")}
				className="block h-40 animate-pulse rounded-xl bg-subtle"
			/>
		);
	}
	if (query.isError) {
		return (
			<div
				role="alert"
				className="rounded-xl border border-line bg-surface p-8 text-center"
			>
				<p className="font-semibold">
					{resolveErrorMessage(query.error, tRoot, t("loadError"))}
				</p>
				<button
					type="button"
					onClick={() => void query.refetch()}
					className="mt-4 h-10 rounded-lg bg-brand-fill px-4 text-sm text-white"
				>
					{t("retry")}
				</button>
			</div>
		);
	}

	const sheet = query.data;
	const dispute = sheet.dispute;
	const when = (iso: string) =>
		new Intl.DateTimeFormat(locale, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(iso));
	const history = sheet.partyHistory;
	const canResolve = dispute.status === "under_review";

	return (
		<div className="space-y-6">
			<Link
				href="/moderation/disputes"
				className="text-brand text-sm hover:underline"
			>
				{t("back")}
			</Link>
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="font-bold text-2xl text-ink">
						{tRoot("Disputes.case", { number: dispute.number })}
					</h1>
					<p className="text-ink-muted text-sm">
						{tRoot("Disputes.orderNumber", { number: dispute.orderNumber })} ·{" "}
						{tRoot(`Disputes.${DISPUTE_REASON_LABELS[dispute.reason]}`)} ·{" "}
						{tRoot(`Disputes.${DISPUTE_STATUS_LABELS[dispute.status]}`)}
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						type="button"
						variant="outline"
						disabled={action.isPending}
						onClick={() => action.mutate({ action: "assign" })}
					>
						{t("assignToMe")}
					</Button>
					{canResolve ? (
						<Button type="button" onClick={() => setResolving(true)}>
							{t("resolve")}
						</Button>
					) : null}
				</div>
			</header>
			{action.isError ? (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(
						action.error,
						tRoot,
						tRoot("Disputes.actionError"),
					)}
				</p>
			) : null}
			<div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
				<div className="space-y-6">
					<section className="space-y-3 rounded-xl border border-line bg-surface p-4">
						<h2 className="font-semibold">{tRoot("Disputes.messages")}</h2>
						{dispute.messages.length ? (
							<ol className="space-y-2">
								{dispute.messages.map((m) => (
									<li key={m.id} className="rounded-lg bg-canvas p-3 text-sm">
										<p className="font-medium text-ink-mid text-xs">
											{t(`author.${m.authorType}`)} · {when(m.at)}
										</p>
										<p className="mt-1 whitespace-pre-wrap">
											{m.redacted ? tRoot("Disputes.redacted") : m.body}
										</p>
										{m.redacted ? null : (
											<RedactMessageControl
												disputeId={dispute.id}
												messageId={m.id}
											/>
										)}
									</li>
								))}
							</ol>
						) : (
							<p className="text-ink-muted text-sm">
								{tRoot("Disputes.noMessages")}
							</p>
						)}
					</section>
					<section className="space-y-3">
						<h2 className="font-semibold">{tRoot("Disputes.evidenceTitle")}</h2>
						<DisputeEvidence
							disputeId={dispute.id}
							evidence={dispute.evidence}
						/>
					</section>
				</div>
				<aside className="space-y-4">
					<section className="space-y-1 rounded-xl border border-line bg-surface p-4 text-sm">
						<h2 className="font-semibold">{t("money")}</h2>
						<p>
							{tRoot("Disputes.amountAtStake", {
								amount: formatOrderMoney(dispute.amountAtStake),
							})}
						</p>
						<p className="text-ink-muted">
							{t("previewBreakdown", {
								goods: formatOrderMoney(sheet.components.goods),
								delivery: formatOrderMoney(sheet.components.outboundDelivery),
								protection: formatOrderMoney(
									sheet.components.buyerProtectionFee,
								),
							})}
						</p>
						<p className="text-ink-muted">
							{t(`payment.${dispute.paymentMethod}`)}
						</p>
						{dispute.deadlines.reviewDueAt ? (
							<p className="text-ink-muted">
								{tRoot("Disputes.deadline", {
									date: when(dispute.deadlines.reviewDueAt),
								})}
							</p>
						) : null}
					</section>
					<section className="space-y-1 rounded-xl border border-line bg-surface p-4 text-sm">
						<h2 className="font-semibold">{t("parties")}</h2>
						<p>{t("buyerDisputes", { count: history.buyerDisputes12m })}</p>
						<p>{t("buyerRefusals", { count: history.buyerRefusalScore })}</p>
						<p>
							{t("shopLossRate", {
								rate:
									history.shopDisputeLossRate === null
										? "—"
										: `${Math.round(history.shopDisputeLossRate * 100)}%`,
							})}
						</p>
						<p>
							{t("shopStrikes", { weight: history.shopStanding.activeWeight })}
						</p>
						<p className="text-ink-muted">{dispute.shopName}</p>
						{sheet.resale ? (
							<p className="text-ink-muted">{t("resale")}</p>
						) : null}
					</section>
					<DisputeStrikes
						disputeId={dispute.id}
						strikes={history.shopStanding.strikes}
						viewerIsAdmin={user?.role === "admin"}
					/>
					<section className="space-y-1 rounded-xl border border-line bg-surface p-4 text-sm">
						<h2 className="font-semibold">{t("proofChecklist")}</h2>
						<ul className="space-y-1">
							{sheet.proofChecklist.map((row) => (
								<li
									key={row.requirement}
									className={
										row.established ? "text-emerald-700" : "text-ink-muted"
									}
								>
									{t(`proof.${row.requirement}`)}:{" "}
									{row.established ? t("proven") : t("notProven")}
								</li>
							))}
						</ul>
					</section>
					{canResolve ? (
						<DisputeRequestInfo
							disputeId={dispute.id}
							messages={dispute.messages}
						/>
					) : null}
				</aside>
			</div>
			{canResolve ? (
				<DisputeResolveSheet
					sheet={sheet}
					viewerIsAdmin={user?.role === "admin"}
					open={resolving}
					onOpenChange={setResolving}
				/>
			) : null}
		</div>
	);
}
