import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";
import type { TimelineEntry } from "~/lib/verification";

const TONE_STYLES = {
	warning: "border-amber-200 bg-amber-50 text-amber-900",
	negative: "border-red-200 bg-red-50 text-red-900",
} as const;

/**
 * The reviewer's own words, surfaced only for the two statuses a seller must
 * act on: a request sent back for more information, or one turned down.
 */
export function ReviewerMessage({ entry }: { entry: TimelineEntry }) {
	const t = useTranslations("Verification");
	if (entry.status !== "needs_info" && entry.status !== "rejected") {
		return null;
	}
	if (!entry.message) return null;

	const tone = entry.status === "rejected" ? "negative" : "warning";

	return (
		<output
			className={cn("block rounded-xl border p-4 text-sm", TONE_STYLES[tone])}
		>
			<p className="font-semibold">
				{t(`reviewerMessage.title.${entry.status}`)}
			</p>
			<p className="mt-1">{entry.message}</p>
		</output>
	);
}
