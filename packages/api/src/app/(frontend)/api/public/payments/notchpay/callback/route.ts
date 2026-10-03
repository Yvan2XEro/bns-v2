import config from "@payload-config";
import { getPayload } from "payload";
import { z } from "zod";
import { appRedirectPage } from "@/lib/appRedirectPage";
import { settleCheckoutCallback } from "@/services/checkoutPayment";

const orderIdSchema = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[A-Za-z0-9_-]+$/);

/**
 * GET return from a hosted checkout (`CHECKOUT_CALLBACK_PATH?orderId=`). It
 * verifies with the provider and settles with `source: "callback"`, then
 * always lands on the pending screen, which polls for the truth. As in P0's
 * boost callback, the app asks for its deep link with `appReturnUrl` (or
 * `platform=mobile`); the supplied URL itself is never followed.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const parsed = orderIdSchema.safeParse(url.searchParams.get("orderId"));
	const orderId = parsed.success ? parsed.data : null;

	if (orderId) {
		try {
			const payload = await getPayload({ config });
			await settleCheckoutCallback(payload, orderId);
		} catch (error) {
			console.error(
				"[checkout callback] verification failed:",
				error instanceof Error ? error.message : error,
			);
		}
	}

	const toApp =
		url.searchParams.has("appReturnUrl") ||
		url.searchParams.get("platform") === "mobile";
	const path = orderId ? `checkout/${orderId}/pending` : "";
	if (toApp) return appRedirectPage(`buynsellem://${path}`);
	const webUrl = process.env.PUBLIC_WEB_URL ?? "https://buynsellem.com";
	return Response.redirect(`${webUrl}/${path}`, 302);
}
