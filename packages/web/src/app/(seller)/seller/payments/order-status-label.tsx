"use client";

import { useTranslations } from "next-intl";
import { ORDER_STATUSES, statusLabelKey } from "~/lib/order-status";

/** Kept apart so the `OrderStatus` namespace is the only one this file names
 * (see `app/purchases/status-label.tsx`, the buyer-side twin). */
export function OrderStatusLabel({ status }: { status: string }) {
	const t = useTranslations("OrderStatus");
	const known = (ORDER_STATUSES as readonly string[]).includes(status);
	return (
		<span className="inline-flex rounded-full bg-[#EFF6FF] px-2.5 py-0.5 font-medium text-[#1E40AF] text-xs">
			{known
				? t(statusLabelKey(status as (typeof ORDER_STATUSES)[number], "seller"))
				: status}
		</span>
	);
}
