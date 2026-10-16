"use client";

import { MapPin } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function AddressesEntry() {
	const t = useTranslations("Addresses");
	return (
		<Link
			href="/account/addresses"
			className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand-line hover:bg-canvas"
		>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft">
				<MapPin aria-hidden="true" className="h-5 w-5 text-brand" />
			</div>
			<div>
				<p className="font-medium text-ink text-sm">{t("title")}</p>
				<p className="text-ink-muted text-xs">{t("entrySubtitle")}</p>
			</div>
		</Link>
	);
}
