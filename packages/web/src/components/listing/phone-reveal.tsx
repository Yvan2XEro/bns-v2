"use client";

import { Loader2, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import { useRevealContactPhone } from "~/hooks/use-contact-phone";
import { resolveErrorMessage } from "~/lib/apiError";

interface PhoneRevealProps {
	listingId: string;
	signedIn: boolean;
}

function goToSignIn() {
	window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`;
}

export function PhoneReveal({ listingId, signedIn }: PhoneRevealProps) {
	const t = useTranslations("Listing");
	const tErrors = useTranslations();
	const reveal = useRevealContactPhone(listingId);
	const phone = reveal.data?.phone;

	function onReveal() {
		if (!signedIn) {
			goToSignIn();
			return;
		}
		reveal.mutate(undefined, {
			onError: (error) => {
				// The session expired between the page render and the tap.
				if (error.status === 401) goToSignIn();
			},
		});
	}

	if (phone) {
		return (
			<a
				href={`tel:${phone}`}
				className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 font-medium text-[#0F172A] text-sm transition-colors hover:bg-[#F1F5F9]"
			>
				<Phone className="h-4 w-4 text-[#16A34A]" />
				{phone}
			</a>
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
					<Phone className="mr-2 h-4 w-4 text-[#16A34A]" />
				)}
				{t("showNumber")}
			</Button>
			{reveal.error && (
				<p className="text-center text-red-500 text-xs">
					{resolveErrorMessage(reveal.error, tErrors)}
				</p>
			)}
		</div>
	);
}
