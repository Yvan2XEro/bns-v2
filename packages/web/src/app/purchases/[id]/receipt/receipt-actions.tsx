"use client";

import { ArrowLeft, Download, Printer } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";

/** The download is the API's whole document, stylesheet included, as served. */
export function ReceiptActions({
	orderId,
	html,
}: {
	orderId: string;
	html: string;
}) {
	const t = useTranslations("Purchases");

	function download() {
		const url = URL.createObjectURL(
			new Blob([html], { type: "text/html;charset=utf-8" }),
		);
		const link = document.createElement("a");
		link.href = url;
		link.download = `receipt-${orderId}.html`;
		link.click();
		URL.revokeObjectURL(url);
	}

	return (
		<div className="flex flex-wrap items-center gap-2 print:hidden">
			<Link
				href={`/purchases/${encodeURIComponent(orderId)}`}
				className="mr-auto inline-flex min-h-11 items-center gap-2 text-[#1E40AF] text-sm"
			>
				<ArrowLeft className="h-4 w-4" aria-hidden /> {t("backToOrder")}
			</Link>
			<Button
				variant="outline"
				className="min-h-11"
				onClick={() => window.print()}
			>
				<Printer aria-hidden /> {t("printReceipt")}
			</Button>
			<Button className="min-h-11" onClick={download}>
				<Download aria-hidden /> {t("downloadReceipt")}
			</Button>
		</div>
	);
}
