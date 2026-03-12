"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

export function ShareButton({
	title,
	className,
}: {
	title: string;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);

	async function handleShare() {
		const url = window.location.href;

		if (navigator.share) {
			try {
				await navigator.share({ title, url });
				return;
			} catch {
				// User cancelled or not supported, fall through to clipboard
			}
		}

		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Fallback
		}
	}

	return (
		<button
			type="button"
			onClick={handleShare}
			className={
				className ||
				"flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-[#F1F5F9]"
			}
		>
			{copied ? (
				<Check className="h-4 w-4 text-emerald-500" />
			) : (
				<Share2 className="h-4 w-4" />
			)}
		</button>
	);
}
