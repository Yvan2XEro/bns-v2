import { useTranslations } from "next-intl";
import { seatSummary } from "~/lib/team-form";
import type { TeamView } from "~/types";

/**
 * Reads straight off `maxMembers`, never a hard-coded cap: the number
 * changes with the shop's verification level, and a level drop can leave
 * `activeCount` above it (`overage`) without anybody being removed — the
 * meter says so rather than silently showing "7 / 5".
 */
export function TeamLimitMeter({ team }: { team: TeamView }) {
	const t = useTranslations("Team");
	const { used, total, overage } = seatSummary(team);

	return (
		<div className="rounded-2xl border border-[#DBEAFE] bg-white p-4">
			<p className="font-semibold text-[#0F172A] text-sm">
				{t("seats", { used, total })}
			</p>
			{overage > 0 && (
				<p className="mt-1 text-[#B45309] text-xs">
					{t("overage", { count: overage })}
				</p>
			)}
		</div>
	);
}
