import { useLocale, useTranslations } from "next-intl";
import { cn } from "~/lib/utils";
import { statusToneKey, type TimelineEntry } from "~/lib/verification";

const DOT_STYLES = {
	positive: "bg-[#047857]",
	negative: "bg-[#DC2626]",
	warning: "bg-[#B45309]",
	neutral: "bg-[#94A3B8]",
} as const;

/** One request's history, newest first, exactly as `buildTimeline` built it. */
export function RequestTimeline({ entries }: { entries: TimelineEntry[] }) {
	const t = useTranslations("Verification");
	const locale = useLocale();

	if (entries.length === 0) return null;

	return (
		<ol className="space-y-3">
			{entries.map((entry) => {
				const tone = statusToneKey(entry.status);
				return (
					<li
						key={`${entry.status}-${entry.at}`}
						className={cn(
							"flex items-start gap-3 rounded-xl border p-3",
							entry.current
								? "border-[#93C5FD] bg-[#F8FAFC]"
								: "border-[#E2E8F0] bg-white",
						)}
					>
						<span
							aria-hidden="true"
							className={cn(
								"mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
								DOT_STYLES[tone],
							)}
						/>
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<p className="font-semibold text-[#0F172A] text-sm">
									{t(`timeline.status.${entry.status}`)}
								</p>
								<time dateTime={entry.at} className="text-[#64748B] text-xs">
									{new Date(entry.at).toLocaleDateString(locale, {
										day: "numeric",
										month: "short",
										year: "numeric",
										hour: "2-digit",
										minute: "2-digit",
									})}
								</time>
							</div>
						</div>
					</li>
				);
			})}
		</ol>
	);
}
