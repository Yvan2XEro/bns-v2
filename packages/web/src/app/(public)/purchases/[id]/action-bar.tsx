"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import type { OrderAction } from "~/hooks/use-order-actions";

export type BarDialog =
	| "cancel"
	| "confirm_receipt"
	| "contest_delivery"
	| "request_withdrawal";

const BAR_DIALOGS: Record<
	BarDialog,
	{ labelKey: string; variant: "default" | "outline" | "destructive" }
> = {
	confirm_receipt: { labelKey: "confirmReceipt", variant: "default" },
	request_withdrawal: { labelKey: "returnItem", variant: "outline" },
	contest_delivery: { labelKey: "contestDelivery", variant: "outline" },
	cancel: { labelKey: "cancel", variant: "destructive" },
};

function isBarDialog(action: OrderAction): action is BarDialog {
	return action in BAR_DIALOGS;
}

/**
 * Renders the buttons `availableActions(order, "buyer")` returns, in its
 * order, and nothing else. The confirmation code, the handover code and the
 * review have panels of their own on the page; they read the same list.
 */
export function ActionBar({
	orderId,
	actions,
	onOpen,
}: {
	orderId: string;
	actions: readonly OrderAction[];
	onOpen: (dialog: BarDialog) => void;
}) {
	const t = useTranslations("Purchases");
	if (actions.length === 0) return null;

	return (
		<nav aria-label={t("actionsTitle")} className="flex flex-wrap gap-2">
			{actions.map((action) => {
				if (isBarDialog(action)) {
					const { labelKey, variant } = BAR_DIALOGS[action];
					return (
						<Button
							key={action}
							variant={variant}
							className="min-h-11"
							onClick={() => onOpen(action)}
						>
							{t(labelKey)}
						</Button>
					);
				}
				if (action === "receipt") {
					return (
						<Button key={action} variant="outline" className="min-h-11" asChild>
							<Link href={`/purchases/${encodeURIComponent(orderId)}/receipt`}>
								{t("viewReceipt")}
							</Link>
						</Button>
					);
				}
				return null;
			})}
		</nav>
	);
}
