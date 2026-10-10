"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import { useFeeInvoiceDownload } from "~/hooks/use-purchases";
import { resolveErrorMessage } from "~/lib/apiError";

/**
 * Mirrors `PayInvoiceButton`'s pattern: the tab opens inside the click,
 * before the signed-URL request resolves, so a popup blocker never catches
 * it on the `await`.
 */
export function FeeInvoiceButton({ invoiceId }: { invoiceId: string }) {
	const t = useTranslations("Payments");
	const tRoot = useTranslations();
	const download = useFeeInvoiceDownload();

	const onClick = () => {
		const tab = window.open("", "_blank");
		download.mutate(invoiceId, {
			onSuccess: ({ url }) => {
				if (!tab) {
					window.location.assign(url);
					return;
				}
				tab.opener = null;
				tab.location.href = url;
			},
			onError: () => tab?.close(),
		});
	};

	return (
		<div className="space-y-1">
			<Button
				type="button"
				variant="outline"
				className="min-h-11"
				onClick={onClick}
				disabled={download.isPending}
			>
				{download.isPending && (
					<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
				)}
				{t("order_feeInvoice")}
			</Button>
			{download.isError && (
				<p role="alert" className="text-red-700 text-xs">
					{resolveErrorMessage(download.error, tRoot)}
				</p>
			)}
		</div>
	);
}
