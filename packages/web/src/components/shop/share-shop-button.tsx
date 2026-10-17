"use client";

import { Check, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { shopUrl } from "~/lib/shop-url";

export function ShareShopButton({
	handle,
	name,
	variant = "outline",
	label,
}: {
	handle: string;
	name: string;
	variant?: "outline" | "default";
	label?: string;
}) {
	const t = useTranslations("Shop");
	const [copied, setCopied] = useState(false);

	async function share() {
		const url = shopUrl(handle);
		if (navigator.share) {
			try {
				await navigator.share({ title: name, url });
				return;
			} catch {
				// Cancelled or unsupported: copy instead.
			}
		}
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			window.prompt(t("copyPrompt"), url);
		}
	}

	return (
		<Button
			type="button"
			variant={variant}
			onClick={share}
			className={
				variant === "outline"
					? "rounded-lg border-line hover:border-[var(--shop-accent-border,var(--c-line))] hover:text-[var(--shop-accent-text,inherit)]"
					: "rounded-lg bg-brand-fill hover:bg-brand-strong"
			}
		>
			{copied ? (
				<Check className="mr-2 h-4 w-4 text-emerald-500" />
			) : (
				<Share2 className="mr-2 h-4 w-4" />
			)}
			{copied ? t("linkCopied") : (label ?? t("share"))}
		</Button>
	);
}
