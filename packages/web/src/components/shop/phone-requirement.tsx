"use client";

import { useTranslations } from "next-intl";
import { PhoneGate } from "~/components/shop/phone-gate";
import { usePhoneStatus } from "~/hooks/use-phone-status";
import { maskPhone } from "~/lib/shop-form";

/** The phone gate, or the confirmation that the account already passed it. */
export function PhoneRequirement({ returnTo }: { returnTo: string }) {
	const t = useTranslations("ShopCreate");
	const { data, isPending } = usePhoneStatus();

	if (isPending) {
		return <div className="h-16 animate-pulse rounded-xl bg-[#F1F5F9]" />;
	}
	if (!data?.isPhoneVerified) return <PhoneGate returnTo={returnTo} />;

	return (
		<p className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-[#166534] text-sm">
			{t("phoneVerified", { phone: maskPhone(data.phone) })}
		</p>
	);
}
