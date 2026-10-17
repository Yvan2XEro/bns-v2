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
		<div className="flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-12 text-center">
			<span className="flex h-12 w-12 items-center justify-center rounded-full bg-subtle">
				<Lock aria-hidden="true" className="h-6 w-6 text-ink-faint" />
			</span>
			<p className="mt-4 max-w-sm text-ink-mid text-sm">{t("locked")}</p>
			<Link
				href="/seller/verification"
				className="mt-4 h-10 rounded-lg bg-[var(--shop-accent,var(--c-brand-fill))] px-4 py-2 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
			>
				{t("lockedCta")}
			</Link>
		</div>
	);
}
