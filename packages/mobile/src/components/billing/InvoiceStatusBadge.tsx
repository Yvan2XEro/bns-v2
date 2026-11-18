import { StatusTag, type StatusTone } from "@/src/components/shop/Tags";
import { INVOICE_STATUS_KEYS, type InvoiceStatus } from "@/src/lib/billing";
import { useTranslation } from "@/src/lib/i18n";

/**
 * What an invoice asks of the seller: an issued one is waiting on them, an
 * overdue one went wrong, a paid one is done. Toned through the shared
 * `StatusTag`, whose text tones hold 4.5:1 in both themes (the old indigo
 * label on the night tint fell to about 3.5:1).
 */
const TONE: Record<InvoiceStatus, StatusTone> = {
	issued: "warning",
	paid: "success",
	overdue: "danger",
	waived: "neutral",
	void: "neutral",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
	const { t } = useTranslation();
	return (
		<StatusTag label={t(INVOICE_STATUS_KEYS[status])} tone={TONE[status]} />
	);
}
