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
export function PhoneRequirement() {
	const t = useTranslations("ShopCreate");
	const { data, isPending } = usePhoneStatus();
	const [dialogOpen, setDialogOpen] = useState(false);

	if (isPending) {
		return <div className="h-16 animate-pulse rounded-xl bg-[#F1F5F9]" />;
	}

	if (!data?.isPhoneVerified) {
		return (
			<div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-5">
				<div className="flex items-start gap-3">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white">
						<Smartphone className="h-5 w-5 text-[#1E40AF]" />
					</div>
					<div className="space-y-2">
						<p className="font-semibold text-[#0F172A]">{t("gateTitle")}</p>
						<p className="text-[#334155] text-sm">{t("gateBody")}</p>
						<button
							type="button"
							onClick={() => setDialogOpen(true)}
							className="inline-flex h-10 items-center rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
						>
							{t("gateCta")}
						</button>
						<p className="text-[#64748B] text-xs">{t("gatePrivacy")}</p>
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
		<p className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-[#166534] text-sm">
			{t("phoneVerified", { phone: maskPhone(data.phone) })}
		</p>
	);
}
