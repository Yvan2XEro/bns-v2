"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import { usePayInvoice } from "~/hooks/use-billing";
import { resolveErrorMessage } from "~/lib/apiError";

/**
 * The tab is opened inside the click, before the request: a `window.open`
 * after an `await` is no longer a user gesture and popup blockers drop it.
 */
export function PayInvoiceButton({
	shopId,
	invoiceId,
}: {
	shopId: string;
	invoiceId: string;
}) {
	const t = useTranslations("Billing");
	const tRoot = useTranslations();
	const pay = usePayInvoice(shopId);

	const onPay = () => {
		const tab = window.open("", "_blank");
		pay.mutate(invoiceId, {
			onSuccess: ({ checkoutUrl }) => {
				if (!tab) {
					window.location.assign(checkoutUrl);
					return;
				}
				tab.opener = null;
				tab.location.href = checkoutUrl;
			},
			onError: () => tab?.close(),
		});
	};

	return (
		<div className="flex flex-col items-end gap-1">
			<Button className="h-11" onClick={onPay} disabled={pay.isPending}>
				{pay.isPending && <LoaderCircle className="animate-spin" />}
				{pay.isPending ? t("payOpening") : t("pay")}
			</Button>
			{pay.isError && (
				<p role="alert" className="max-w-xs text-right text-red-700 text-xs">
					{resolveErrorMessage(pay.error, tRoot)}
				</p>
			)}
		</div>
	);
}
