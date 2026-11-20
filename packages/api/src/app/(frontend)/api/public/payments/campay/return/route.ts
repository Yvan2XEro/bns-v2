import config from "@payload-config";
import { getPayload } from "payload";
import {
	returnStatusOf,
	safeNextPath,
	settleCamPayReturn,
} from "@/services/campayReturn";

/**
 * GET return from CamPay's payment page for BuyNSellem's own invoices
 * (commission, reseller charges): `?ref=PI-…&next=/seller/…`. Settles from
 * CamPay's own record, then sends the payer to `next` with the outcome;
 * the page refetches the invoice anyway.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	let status = returnStatusOf(null);
	try {
		const payload = await getPayload({ config });
		status = returnStatusOf(
			await settleCamPayReturn(payload, url.searchParams.get("ref")),
		);
	} catch (error) {
		console.error(
			"[campay return] verification failed:",
			error instanceof Error ? error.message : error,
		);
	}
	const webUrl = process.env.PUBLIC_WEB_URL ?? "https://buynsellem.com";
	const target = new URL(safeNextPath(url.searchParams.get("next")), webUrl);
	target.searchParams.set("payment", status);
	return Response.redirect(target.toString(), 302);
}
