"use client";

import { Check, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { WhatsAppIcon } from "~/components/icons/whatsapp-icon";
import { whatsappShareUrl } from "../../../../api/src/contracts/whatsapp";

const ICON_BUTTON =
	"flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-muted hover:bg-subtle";

export function ShareButton({
	title,
	className,
}: {
	title: string;
	className?: string;
}) {
	const t = useTranslations("Listing");
	const [copied, setCopied] = useState(false);

	async function handleShare() {
		const url = window.location.href;

		if (navigator.share) {
			try {
				await navigator.share({ title, url });
				return;
			} catch (error) {
				// Closing the share sheet is a choice, not a reason to copy.
				if (error instanceof DOMException && error.name === "AbortError")
					return;
			}
		}

		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard refused (insecure context): nothing else to offer.
		}
	}

	return (
		<span className="relative inline-flex">
			<button
				type="button"
				onClick={handleShare}
				aria-label={t("share")}
				className={className || ICON_BUTTON}
			>
				{copied ? (
					<Check aria-hidden className="h-4 w-4 text-emerald-500" />
				) : (
					<Share2 aria-hidden className="h-4 w-4" />
				)}
			</button>
			{copied && (
				<output className="-translate-x-1/2 absolute top-full left-1/2 z-10 mt-1 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-surface text-xs">
					{t("linkCopied")}
				</output>
			)}
		</span>
	);
}

/** Opens WhatsApp with the listing's title and link, to send to a contact. */
export function WhatsAppShareButton({ title }: { title: string }) {
	const t = useTranslations("Listing");
	return (
		<button
			type="button"
			aria-label={t("shareOnWhatsApp")}
			title={t("shareOnWhatsApp")}
			onClick={() =>
				window.open(
					whatsappShareUrl(`${title} ${window.location.href}`),
					"_blank",
					"noopener",
				)
			}
			className={ICON_BUTTON}
		>
			<WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
		</button>
	);
}
