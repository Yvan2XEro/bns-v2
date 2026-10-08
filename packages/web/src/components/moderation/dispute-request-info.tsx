"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useModerationDisputeAction } from "~/hooks/use-moderation-disputes";
import { resolveErrorMessage } from "~/lib/apiError";
import { infoRequestState } from "~/lib/moderation-dispute-decision";

export function DisputeRequestInfo({
	disputeId,
	messages,
}: {
	disputeId: string;
	messages: ReadonlyArray<{ kind: string }>;
}) {
	const t = useTranslations("ModerationDisputes");
	const tRoot = useTranslations();
	const action = useModerationDisputeAction(disputeId);
	const [from, setFrom] = useState<"buyer" | "seller">("seller");
	const [message, setMessage] = useState("");
	const state = infoRequestState(messages);

	return (
		<section className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
			<h2 className="font-semibold text-[#0F172A]">{t("requestInfo")}</h2>
			<p className="text-[#64748B] text-sm">
				{t("infoRequestsUsed", { used: state.used, cap: state.cap })}
			</p>
			{state.exhausted ? (
				<output className="block text-amber-900 text-sm">
					{t("infoRequestsExhausted")}
				</output>
			) : (
				<>
					<select
						aria-label={t("infoFrom")}
						className="w-full rounded-lg border border-[#CBD5E1] p-2 text-sm"
						value={from}
						onChange={(e) =>
							setFrom(e.target.value === "buyer" ? "buyer" : "seller")
						}
					>
						<option value="seller">{t("liability.seller")}</option>
						<option value="buyer">{t("liability.buyer")}</option>
					</select>
					<textarea
						aria-label={t("infoMessage")}
						rows={3}
						maxLength={2000}
						className="w-full rounded-lg border border-[#CBD5E1] p-2 text-sm"
						value={message}
						onChange={(e) => setMessage(e.target.value)}
					/>
					<Button
						type="button"
						disabled={!message.trim() || action.isPending}
						onClick={() =>
							action.mutate(
								{ action: "request_info", from, message: message.trim() },
								{ onSuccess: () => setMessage("") },
							)
						}
					>
						{t("sendInfoRequest")}
					</Button>
				</>
			)}
			{action.isError ? (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(action.error, tRoot)}
				</p>
			) : null}
		</section>
	);
}
