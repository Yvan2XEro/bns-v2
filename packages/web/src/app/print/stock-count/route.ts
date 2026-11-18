import { printDocumentResponse } from "~/lib/print-document";
import { getMyShop } from "~/lib/server-shop";

/**
 * The active shop's stock count sheet, ready to print:
 * `?blind=1` hides the expected stock, `?autoprint=1` opens the dialog.
 */
export async function GET(request: Request) {
	const mine = await getMyShop();
	if (!mine?.shop) return Response.redirect(new URL("/shop/new", request.url));
	return printDocumentResponse(
		request,
		`/api/shops/${mine.shop.id}/print/stock-count`,
	);
}
