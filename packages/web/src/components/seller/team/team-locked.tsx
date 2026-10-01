import { Lock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * `TeamView.teamMembers` is `false` below verification level 2 — the
 * server's own capability flag, never a level number re-derived here (the
 * same reasoning `can` and `canSeeCost` document: never re-derive what the
 * server already states).
 */
export function TeamLocked() {
	const t = useTranslations("Team");

	return (
		<div className="flex flex-col items-center rounded-2xl border border-[#E2E8F0] bg-white px-6 py-12 text-center">
			<span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
				<Lock aria-hidden="true" className="h-6 w-6 text-[#94A3B8]" />
			</span>
			<p className="mt-4 max-w-sm text-[#475569] text-sm">{t("locked")}</p>
			<Link
				href="/seller/verification"
				className="mt-4 h-10 rounded-lg bg-[#1E40AF] px-4 py-2 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
			>
				{t("lockedCta")}
			</Link>
		</div>
	);
}
