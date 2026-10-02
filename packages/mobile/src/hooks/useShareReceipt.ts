import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { receiptFileName } from "../lib/purchaseActions";
import { useOrderReceipt } from "./usePurchases";

/**
 * The receipt is `text/html` behind the caller's token, so it cannot be
 * handed to a browser by URL. It is fetched through the API client, written
 * to the cache and given to the system share sheet, where the buyer opens,
 * prints or keeps it.
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
			const file = new File(
				Paths.cache,
				receiptFileName(order.orderNumber, lang),
			);
			file.create({ overwrite: true });
			file.write(result.data ?? "");
			await Sharing.shareAsync(file.uri, {
				mimeType: "text/html",
				UTI: "public.html",
			});
		} finally {
			setSharing(false);
		}
	};

	return { share, pending: sharing || receipt.isFetching };
}
