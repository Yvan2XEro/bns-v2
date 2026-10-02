"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useBilling } from "~/hooks/use-billing";
import { can } from "~/lib/shop-roles";
import type { ShopRole } from "~/types";

/**
 * The sidebar's pointer to the restriction; the billing page's banner is the
 * one that explains it. The restriction is only readable through billing
 * (`payments.view`), so staff, who cannot open that page either, get no link.
 */
export function OrdersRestrictedNotice({
	shopId,
	role,
	ordersEnabled,
}: {
	shopId: string;
	role: ShopRole | null;
	ordersEnabled: boolean;
}) {
	const t = useTranslations("Seller");
	const readable = ordersEnabled && can(role, "payments.view");
	const billing = useBilling(readable ? shopId : null);
	if (!readable || !billing.data?.restricted) return null;

	return (
		<Link
			href="/seller/billing"
			className="mx-2 mb-2 flex min-h-11 items-start gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs"
		>
			<ShieldAlert
				aria-hidden="true"
				className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B91C1C]"
			/>
			<span>
				<span className="block font-semibold text-[#7F1D1D]">
					{t("ordersRestricted")}
				</span>
				<span className="text-[#1E40AF] underline">
					{t("ordersRestrictedLink")}
				</span>
			</span>
		</Link>
	);
}
