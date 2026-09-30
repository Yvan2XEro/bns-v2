"use client";

import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import type { ReturnOutcome as ReturnOutcomeValue } from "~/lib/verification";

/** `in_review` and a fresh `submitted` read the same to a seller: a person is looking at it now. */
function answerKey(status: string): string {
	if (status === "approved") return "approved";
	if (status === "needs_info") return "needsInfo";
	if (status === "rejected") return "rejected";
	if (status === "revoked") return "revoked";
	if (status === "expired") return "expired";
	return "submitted";
}

/** Renders exactly one of the poll's outcomes: still checking, a decline with attempts left, the timeout, or an answer. Mirrors mobile's `ReturnOutcome` component. */
export function ReturnOutcomeView({
	outcome,
	onRetry,
	onRefresh,
}: {
	outcome: ReturnOutcomeValue;
	onRetry: () => void;
	onRefresh: () => void;
}) {
	const t = useTranslations("Verification.return");

	if (outcome.kind === "polling") {
		return (
			<div className="space-y-2 text-center">
				<h1 className="font-bold text-[#0F172A] text-lg">
					{t("polling.title")}
				</h1>
				<p className="text-[#64748B] text-sm">{t("polling.body")}</p>
			</div>
		);
	}

	if (outcome.kind === "declinedRetry") {
		return (
			<div className="space-y-3 text-center">
				<h1 className="font-bold text-[#0F172A] text-lg">
					{t("outcome.declinedRetry.title")}
				</h1>
				<p className="text-[#64748B] text-sm">
					{t("outcome.declinedRetry.body")}
				</p>
				<Button onClick={onRetry}>{t("outcome.declinedRetry.cta")}</Button>
			</div>
		);
	}

	if (outcome.kind === "timeout") {
		return (
			<div className="space-y-3 text-center">
				<h1 className="font-bold text-[#0F172A] text-lg">
					{t("outcome.timeout.title")}
				</h1>
				<p className="text-[#64748B] text-sm">{t("outcome.timeout.body")}</p>
				<Button onClick={onRefresh}>{t("outcome.timeout.cta")}</Button>
			</div>
		);
	}

	const key = answerKey(outcome.status);
	return (
		<div className="space-y-2 text-center">
			<h1 className="font-bold text-[#0F172A] text-lg">
				{t(`outcome.answer.${key}.title`)}
			</h1>
			<p className="text-[#64748B] text-sm">
				{t(`outcome.answer.${key}.body`)}
			</p>
		</div>
	);
}
