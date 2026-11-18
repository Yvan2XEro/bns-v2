"use client";

import { Loader2, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { WhatsAppIcon } from "~/components/icons/whatsapp-icon";
import { PhoneVerificationDialog } from "~/components/shop/phone-verification-dialog";
import { Button } from "~/components/ui/button";
import { useRevealContactPhone } from "~/hooks/use-contact-phone";
import { usePhoneStatus } from "~/hooks/use-phone-status";
import { resolveErrorMessage } from "~/lib/apiError";
import { whatsappChatUrl } from "../../../../api/src/contracts/whatsapp";

interface PhoneRevealProps {
	listingId: string;
	signedIn: boolean;
	/** Prefills the WhatsApp message offered next to the revealed number. */
	listingTitle: string;
}

function goToSignIn() {
	window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`;
}

export function PhoneReveal({
	listingId,
	signedIn,
	listingTitle,
}: PhoneRevealProps) {
	const t = useTranslations("Listing");
	const tErrors = useTranslations();
	const reveal = useRevealContactPhone(listingId);
	const phone = reveal.data?.phone;
	// A seller's number is shown only to an account with a verified phone:
	// verify in place, then show it (contracts/accountTrust.ts).
	const phoneStatus = usePhoneStatus(signedIn);
	const [verifying, setVerifying] = useState(false);

	function onReveal() {
		if (!signedIn) {
			goToSignIn();
			return;
		}
		if (phoneStatus.data?.isPhoneVerified !== true) {
			setVerifying(true);
			return;
		}
		show();
	}

	function show() {
		reveal.mutate(undefined, {
			onError: (error) => {
				// The session expired between the page render and the tap.
				if (error.status === 401) goToSignIn();
			},
		});
	}

	if (phone) {
		// WhatsApp is where most buyers and sellers actually talk.
		const whatsapp = whatsappChatUrl(
			phone,
			t("whatsappAbout", { title: listingTitle, url: window.location.href }),
		);
		return (
			<div className="flex gap-2">
				<a
					href={`tel:${phone}`}
					aria-label={t("callNumber", { phone })}
					className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 font-medium text-ink text-sm transition-colors hover:bg-subtle"
				>
					<Phone aria-hidden className="h-4 w-4 text-ok" />
					{phone}
				</a>
				{whatsapp && (
					<a
						href={whatsapp}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 font-semibold text-[#0F172A] text-sm hover:bg-[#1EBE5A]"
					>
						<WhatsAppIcon className="h-4 w-4" />
						{t("whatsapp")}
					</a>
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-1">
			<Button
				variant="outline"
				className="w-full rounded-lg"
				onClick={onReveal}
				disabled={reveal.isPending}
			>
				{reveal.isPending ? (
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				) : (
					<Phone className="mr-2 h-4 w-4 text-ok" />
				)}
				{t("showNumber")}
			</Button>
			<PhoneVerificationDialog
				open={verifying}
				onOpenChange={setVerifying}
				onVerified={() => {
					setVerifying(false);
					show();
				}}
			/>
			{reveal.error && (
				<p className="text-center text-red-500 text-xs">
					{resolveErrorMessage(reveal.error, tErrors)}
				</p>
			)}
		</div>
	);
}
