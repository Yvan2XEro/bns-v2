import { shareHtmlAsPdf } from "./printDocument";

/**
 * Hands an HTML document the API served behind the caller's token (an
 * invoice, a receipt) to the share sheet as a PDF: it cannot be opened by
 * URL — the browser would arrive without the token — and a PDF opens
 * everywhere an .html file mostly does not.
 */
export async function shareHtmlDocument(
	html: string,
	fileName: string,
	dialogTitle: string,
): Promise<void> {
	await shareHtmlAsPdf(html, fileName, dialogTitle);
}
