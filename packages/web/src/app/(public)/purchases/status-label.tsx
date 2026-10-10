"use client";

import { useTranslations } from "next-intl";
import { statusLabelKey } from "~/lib/order-status";
import type { OrderStatus } from "~/types/order";

/** Kept apart so the `OrderStatus` namespace is the only one this file names. */
export function StatusLabel({ status }: { status: OrderStatus }) {
	const t = useTranslations("OrderStatus");
	return (
		<span className="inline-flex rounded-full bg-[#EFF6FF] px-2.5 py-0.5 font-medium text-[#1E40AF] text-xs">
			{t(statusLabelKey(status, "buyer"))}
		</span>
	);
}
