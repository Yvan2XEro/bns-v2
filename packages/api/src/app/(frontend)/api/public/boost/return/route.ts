import config from "@payload-config";
import { getPayload } from "payload";

/**
 * Intermediary redirect page after NotchPay checkout.
 * NotchPay calls this URL (via `redirect` param), we look up the final payment
 * status and then forward the user to either the app deep-link or the web listing.
 *
 * Query params:
 *   appReturnUrl  — deep-link base (e.g. "buynsellem://boost/callback")
 *   listingId     — the listing that was being boosted
 *   reference     — NotchPay reference (e.g. "BOOST-<id>")
 *   status        — NotchPay status string (may not be present on all versions)
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const appReturnUrl = url.searchParams.get("appReturnUrl") ?? "";
	const listingId = url.searchParams.get("listingId") ?? "";
	const reference =
		url.searchParams.get("reference") ?? url.searchParams.get("ref") ?? "";

	let status = "pending";

	if (reference) {
		try {
			const payload = await getPayload({ config });
			const paymentId = reference.replace(/^BOOST-/, "");
			const payment = await payload
				.findByID({ collection: "boost-payments", id: paymentId })
				.catch(() => null);

			if (payment?.status === "completed") status = "success";
			else if (payment?.status === "failed") status = "failed";
		} catch {
			// non-critical — just show pending
		}
	}

	if (appReturnUrl) {
		const deepLink = `${appReturnUrl}?status=${status}&listingId=${encodeURIComponent(listingId)}`;

		// Use an HTML redirect page: more reliable than HTTP 302 for opening
		// custom URL schemes from within a browser (WKWebView / Chrome Custom Tabs).
		return new Response(
			`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Returning to app…</title>
  <script>
    // Immediate JS redirect
    window.location.replace(${JSON.stringify(deepLink)});
  </script>
  <meta http-equiv="refresh" content="0;url=${deepLink}" />
</head>
<body style="font-family:sans-serif;text-align:center;padding-top:80px">
  <p>Redirecting back to the app…</p>
  <p><a href="${deepLink}">Tap here if not redirected</a></p>
</body>
</html>`,
			{ headers: { "Content-Type": "text/html; charset=utf-8" } },
		);
	}

	// Web fallback: redirect to the listing page
	const target = listingId
		? `/listing/${listingId}?boostStatus=${status}`
		: "/";
	return Response.redirect(target, 302);
}
