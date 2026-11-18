"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ShareShopButton } from "~/components/shop/share-shop-button";
import { shopUrl } from "~/lib/shop-url";

export function PublicLinkCard({
	handle,
	name,
}: {
	handle: string;
	name: string;
}) {
	const t = useTranslations("Seller");
	const [copied, setCopied] = useState(false);
	const url = shopUrl(handle);

	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			window.prompt(t("copyLink"), url);
		}
	}

	return (
		<div className="rounded-xl border border-line bg-surface p-5">
			<p className="text-ink-muted text-sm">{t("publicPage")}</p>
			<p className="mt-1 break-all font-semibold text-[var(--shop-accent-text,var(--c-brand))]">
				{url.replace(/^https?:\/\//, "")}
			</p>
			<div className="mt-4 flex flex-wrap gap-2">
				<button
					type="button"
					onClick={copy}
					className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 font-semibold text-ink text-sm hover:border-[var(--shop-accent,var(--c-brand))]"
				>
					{copied ? (
						<Check aria-hidden="true" className="h-4 w-4 text-emerald-500" />
					) : (
						<Copy aria-hidden="true" className="h-4 w-4" />
					)}
					{copied ? t("linkCopied") : t("copyLink")}
				</button>
				<ShareShopButton handle={handle} name={name} variant="default" />
			</div>
		</div>
	);
}
