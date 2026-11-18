import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

/** A4 in points, the size every printable document of the API is laid out for. */
const A4 = { width: 595, height: 842 };

/**
 * The documents the API serves as HTML (a stock count sheet, a receipt, an
 * invoice) come with the caller's token, so they cannot be opened by URL;
 * the app fetches the markup and hands it to the system's print service.
 * Its dialog prints (AirPrint, Android printing) and saves as PDF.
 */
export async function printHtmlDocument(html: string): Promise<void> {
	await Print.printAsync({ html, ...A4 });
}

/**
 * The same document as an A4 PDF, given to the share sheet — WhatsApp, mail,
 * Drive — under a readable name: a PDF opens everywhere, an .html file
 * mostly does not.
 */
export async function shareHtmlAsPdf(
	html: string,
	fileName: string,
	dialogTitle: string,
): Promise<void> {
	const { uri } = await Print.printToFileAsync({ html, ...A4 });
	const pdf = new File(Paths.cache, `${fileName.replace(/[^\w.-]/g, "_")}.pdf`);
	if (pdf.exists) pdf.delete();
	new File(uri).move(pdf);
	await Sharing.shareAsync(pdf.uri, {
		mimeType: "application/pdf",
		UTI: "com.adobe.pdf",
		dialogTitle,
	});
}
