import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/**
 * Hands an HTML document the API served behind the caller's token (an
 * invoice, a receipt) to the system share sheet. It cannot be opened by URL —
 * the browser would arrive without the token — and the app has no WebView, so
 * the markup is written to the cache and shared as a file the seller can open,
 * print or forward.
 */
export async function shareHtmlDocument(
	html: string,
	fileName: string,
	dialogTitle: string,
): Promise<void> {
	const file = new File(
		Paths.cache,
		`${fileName.replace(/[^\w.-]/g, "_")}.html`,
	);
	file.create({ overwrite: true });
	file.write(html);
	await Sharing.shareAsync(file.uri, {
		mimeType: "text/html",
		UTI: "public.html",
		dialogTitle,
	});
}
