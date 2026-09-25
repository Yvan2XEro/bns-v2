"use client";

import { Check, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://buynsellem.com";

export function shopUrl(handle: string): string {
	return `${WEB_URL.replace(/\/$/, "")}/s/${handle}`;
}

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
					? "rounded-lg border-[#E2E8F0]"
					: "rounded-lg bg-[#1E40AF] hover:bg-[#1E3A8A]"
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
