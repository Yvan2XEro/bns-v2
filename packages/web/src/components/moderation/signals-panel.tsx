import Link from "next/link";
import { useTranslations } from "next-intl";
import { SignalChip } from "~/components/moderation/signal-chip";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { type ReviewerRequestDetail, statusToneKey } from "~/lib/verification";
import { relationId } from "~/lib/relation-id";

type ReviewSignals = ReviewerRequestDetail["request"]["reviewSignals"];
type OtherRequests = ReviewerRequestDetail["otherRequests"];

const STATUS_TONE_CLASSES: Record<string, string> = {
	positive: "text-emerald-700",
	negative: "text-red-700",
	warning: "text-[#92400E]",
	neutral: "text-[#64748B]",
};

/** Signals raised against this request, and the shop's other requests they (or the reviewer) may need to cross-check. */
export function SignalsPanel({
	signals,
	otherRequests,
}: {
	signals: ReviewSignals;
	otherRequests: OtherRequests;
}) {
	const t = useTranslations("Moderation");

	if (signals.length === 0 && otherRequests.length === 0) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("review.signals.title")}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{signals.length > 0 && (
					<ul className="space-y-2">
						{signals.map((signal, index) => {
							const relatedId = relationId(signal.relatedRequest);
							return (
								<li
									key={signal.id ?? `${signal.code}-${index}`}
									className="flex flex-wrap items-center gap-2 text-sm"
								>
									<SignalChip code={signal.code} />
									{signal.detail && (
										<span className="text-[#64748B]">{signal.detail}</span>
									)}
									{relatedId && (
										<Link
											href={`/moderation/verification/${relatedId}`}
											className="font-medium text-[#1E40AF] hover:underline"
										>
											{t("review.signals.viewRelated")}
										</Link>
									)}
								</li>
							);
						})}
					</ul>
				)}
				{otherRequests.length > 0 && (
					<div className="space-y-2 border-[#E2E8F0] border-t pt-3">
						<p className="text-[#64748B] text-xs uppercase tracking-wide">
							{t("review.signals.otherRequests")}
						</p>
						<ul className="space-y-1.5">
							{otherRequests.map((request) => (
								<li
									key={request.id}
									className="flex items-center justify-between text-sm"
								>
									<Link
										href={`/moderation/verification/${request.id}`}
										className="font-medium text-[#1E40AF] hover:underline"
									>
										{t("review.signals.levelRequest", {
											level: request.requestedLevel,
										})}
									</Link>
									<span
										className={
											STATUS_TONE_CLASSES[statusToneKey(request.status)]
										}
									>
										{t(`status.${request.status}`)}
									</span>
								</li>
							))}
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
