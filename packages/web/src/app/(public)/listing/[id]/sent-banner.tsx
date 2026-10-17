"use client";

import { CheckCircle2, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { WhatsAppIcon } from "~/components/icons/whatsapp-icon";
import { whatsappShareUrl } from "../../../../../../api/src/contracts/whatsapp";

/**
 * Right after sending, the listing is under review, not live: said plainly,
 * with the two next steps a seller actually takes — share it, post another.
 */
export function SentBanner({ title }: { title: string }) {
	const t = useTranslations("CreateListing");
	const sent = useSearchParams().get("sent") === "1";
	if (!sent) return null;
	return (
		<output className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-ok/30 bg-ok-soft p-4">
			<CheckCircle2 aria-hidden className="h-6 w-6 shrink-0 text-ok" />
			<span className="min-w-0 flex-1">
				<span className="block font-semibold text-ink">{t("sentTitle")}</span>
				<span className="block text-ink-muted text-sm">{t("sentBody")}</span>
			</span>
			<button
				type="button"
				onClick={() =>
					window.open(
						whatsappShareUrl(
							`${title} ${window.location.origin}${window.location.pathname}`,
						),
						"_blank",
						"noopener",
					)
				}
				className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 font-semibold text-[#0F172A] text-sm hover:bg-[#1EBE5A]"
			>
				<WhatsAppIcon className="h-4 w-4" />
				{t("sentShare")}
			</button>
			<Link
				href="/create"
				className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 font-medium text-ink text-sm hover:bg-subtle"
			>
				<Plus aria-hidden className="h-4 w-4" />
				{t("sentAnother")}
			</Link>
		</output>
	);
}
