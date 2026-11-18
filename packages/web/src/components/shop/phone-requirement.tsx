"use client";

import { Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PhoneVerificationDialog } from "~/components/shop/phone-verification-dialog";
import { usePhoneStatus } from "~/hooks/use-phone-status";
import { maskPhone } from "~/lib/shop-form";

/**
 * The phone gate, or the confirmation that the account already passed it.
 * Verification happens in a dialog, in place: the seller never leaves the
 * shop-creation form to prove their number (see PhoneVerificationDialog).
 */
export function PhoneRequirement({
	action,
}: {
	/**
	 * What the phone unlocks here, worded for it; without one, the shop
	 * creation's wording.
	 */
	action?: "publishListing" | "boost";
} = {}) {
	const t = useTranslations("ShopCreate");
	const tTrust = useTranslations("AccountTrust");
	const title = action ? tTrust(`${action}.title`) : t("gateTitle");
	const body = action ? tTrust(`${action}.body`) : t("gateBody");
	const { data, isPending } = usePhoneStatus();
	const [dialogOpen, setDialogOpen] = useState(false);

	if (isPending) {
		return <div className="h-16 animate-pulse rounded-xl bg-subtle" />;
	}

	if (!data?.isPhoneVerified) {
		return (
			<div className="rounded-xl border border-brand-tint-strong bg-brand-soft p-5">
				<div className="flex items-start gap-3">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface">
						<Smartphone className="h-5 w-5 text-brand" />
					</div>
					<div className="space-y-2">
						<p className="font-semibold text-ink">{title}</p>
						<p className="text-ink-soft text-sm">{body}</p>
						<button
							type="button"
							onClick={() => setDialogOpen(true)}
							className="inline-flex h-10 items-center rounded-lg bg-brand-fill px-4 font-semibold text-sm text-white hover:bg-brand-strong"
						>
							{t("gateCta")}
						</button>
						<p className="text-ink-muted text-xs">{t("gatePrivacy")}</p>
					</div>
				</div>
				<PhoneVerificationDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					onVerified={() => setDialogOpen(false)}
				/>
			</div>
		);
	}

	return (
		<p className="rounded-xl border border-ok-line bg-ok-faint px-4 py-3 text-ok-ink text-sm">
			{t("phoneVerified", { phone: maskPhone(data.phone) })}
		</p>
	);
}
