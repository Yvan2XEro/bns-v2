"use client";

import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";
import type { OrderListEntry } from "~/types/order";
import {
	paymentPill,
	type ResaleNote,
	resaleNote,
	STATUS_PILL_TONES,
	statusPill,
} from "./order-list";

const PILL =
	"inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 font-semibold text-xs";

export function StatusPill({ status }: { status: OrderListEntry["status"] }) {
	const t = useTranslations("SellerOrderList");
	const pill = statusPill(status);
	return (
		<span className={cn(PILL, STATUS_PILL_TONES[pill])}>
			{t(`status.${pill}`)}
		</span>
	);
}

export function PaymentPill({ row }: { row: OrderListEntry }) {
	const t = useTranslations("SellerOrderList");
	const pill = paymentPill(row);
	if (!pill) return <span className="text-ink-faint">—</span>;
	return (
		<span className={cn(PILL, "bg-subtle text-ink-soft")}>
			{t(`payment.${pill}`)}
		</span>
	);
}

export function useResaleText() {
	const t = useTranslations("SellerOrderList");
	return (note: ResaleNote): string => {
		switch (note.kind) {
			case "pending":
				return t("resale.pending", { supplier: note.supplier });
			case "sent":
				return note.supplier
					? t("resale.sent", { number: note.number, supplier: note.supplier })
					: t("resale.sentNoSupplier", { number: note.number });
			case "plain":
				return note.supplier
					? t("resale.plain", { supplier: note.supplier })
					: t("resale.bare");
		}
	};
}

export function ResalePill({ row }: { row: OrderListEntry }) {
	const text = useResaleText();
	const note = resaleNote(row);
	if (!note) return null;
	return (
		<span className="self-start rounded-full bg-[#EDE9FE] px-2 py-px font-semibold text-[#5B21B6] text-[11px]">
			{text(note)}
		</span>
	);
}
