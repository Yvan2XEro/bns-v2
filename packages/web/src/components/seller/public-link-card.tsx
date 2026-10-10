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
		<div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
			<p className="text-[#64748B] text-sm">{t("publicPage")}</p>
			<p className="mt-1 break-all font-semibold text-[#1E40AF]">
				{url.replace(/^https?:\/\//, "")}
			</p>
			<div className="mt-4 flex flex-wrap gap-2">
				<button
					type="button"
					onClick={copy}
					className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E2E8F0] px-4 font-semibold text-[#0F172A] text-sm hover:border-[#1E40AF]"
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
