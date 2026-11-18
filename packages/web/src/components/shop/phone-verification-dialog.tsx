"use client";

import { useTranslations } from "next-intl";
import { PhoneVerificationForm } from "~/components/shop/phone-verification/phone-verification-form";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";

/**
 * The phone step of shop creation, in place: unlike the old link-out gate,
 * the seller never leaves `/shop/new` and the rest of the form keeps every
 * value they typed. Radix's Dialog gives keyboard reachability (focus trap,
 * Escape to dismiss, a labelled close button) for free.
 */
export function PhoneVerificationDialog({
	open,
	onOpenChange,
	onVerified,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onVerified: () => void;
}) {
	const t = useTranslations("PhoneVerification");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("dialogTitle")}</DialogTitle>
					<DialogDescription>{t("dialogDescription")}</DialogDescription>
				</DialogHeader>
				<PhoneVerificationForm
					onVerified={() => {
						onVerified();
						onOpenChange(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
