import { useState } from "react";
import { shareHtmlAsPdf } from "../lib/printDocument";
import { receiptFileName } from "../lib/purchaseActions";
import { useOrderReceipt } from "./usePurchases";

/**
 * The receipt is `text/html` behind the caller's token, so it cannot be
 * handed to a browser by URL. It is fetched through the API client, made an
 * A4 PDF and given to the system share sheet, where the buyer opens, prints
 * or keeps it.
 */
export function useShareReceipt(
	order: { id: string; orderNumber: string },
	lang: "fr" | "en",
) {
	const receipt = useOrderReceipt(order.id, lang);
	const [sharing, setSharing] = useState(false);

	const share = async () => {
		setSharing(true);
		try {
			const result = await receipt.refetch({ throwOnError: true });
			await shareHtmlAsPdf(
				result.data ?? "",
				receiptFileName(order.orderNumber, lang).replace(/\.html$/, ""),
				order.orderNumber,
			);
		} finally {
			setSharing(false);
		}
	};

	return { share, pending: sharing || receipt.isFetching };
}
