"use client";

import { useTranslations } from "next-intl";
import { type SystemMessageLike, systemChip } from "~/lib/system-message";

/** A centred line for an order event, in the reader's language when this build knows the event. */
export function SystemChip({ message }: { message: SystemMessageLike }) {
	const t = useTranslations("Messages");
	const chip = systemChip(message);
	const text =
		chip.kind === "key"
			? t(chip.key, { orderNumber: chip.orderNumber })
			: chip.text;

	return (
		<div className="flex justify-center">
			<p className="max-w-[85%] rounded-full bg-[#F1F5F9] px-3 py-1 text-center text-[#475569] text-xs">
				{text}
			</p>
		</div>
	);
}
