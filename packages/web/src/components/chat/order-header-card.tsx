"use client";

import { ChevronRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { orderCardOf, type SystemMessageLike } from "~/lib/system-message";

/** Pins the order a conversation is about above its messages, linking to the side's own order screen. */
export function OrderHeaderCard({
	messages,
	side,
}: {
	messages: readonly SystemMessageLike[];
	side: "buyer" | "shop";
}) {
	const t = useTranslations("Messages");
	const card = orderCardOf(messages, side);
	if (!card) return null;

	return (
		<Link
			href={card.href}
			className="flex min-h-11 items-center gap-3 rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] px-3 py-2 text-sm hover:bg-[#DBEAFE]"
		>
			<ShoppingBag
				aria-hidden="true"
				className="h-4 w-4 shrink-0 text-[#1E40AF]"
			/>
			<span className="min-w-0 flex-1 truncate font-medium text-[#0F172A]">
				{card.orderNumber
					? t("orderCardTitle", { orderNumber: card.orderNumber })
					: t("orderCardUntitled")}
			</span>
			<span className="shrink-0 text-[#1E40AF] text-xs">
				{t("orderCardOpen")}
			</span>
			<ChevronRight
				aria-hidden="true"
				className="h-4 w-4 shrink-0 text-[#1E40AF]"
			/>
		</Link>
	);
}
