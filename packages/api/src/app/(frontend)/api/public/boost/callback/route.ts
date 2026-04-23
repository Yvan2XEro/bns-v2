import config from "@payload-config";
import { getPayload } from "payload";
import { getNotchPayProvider } from "@/lib/payments";

/**
 * NotchPay redirige le navigateur ici après le paiement (GET).
 * Query params : reference, appReturnUrl, listingId
 *
 * On vérifie le statut en rappelant l'API NotchPay, on active le boost si
 * le paiement est complet, puis on redirige vers l'app ou la page web.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const reference = url.searchParams.get("reference") ?? "";
	const appReturnUrl = url.searchParams.get("appReturnUrl") ?? "";
	const listingId = url.searchParams.get("listingId") ?? "";

	let status = "failed";

	if (reference) {
		try {
			const notchpay = getNotchPayProvider();
			const paymentStatus = await notchpay.verifyPayment(reference);

			if (paymentStatus === "completed") {
				status = "success";
				await activateBoost(reference);
			} else if (paymentStatus === "pending") {
				status = "pending";
			}
		} catch (err) {
			console.error("NotchPay callback error:", err);
		}
	}

	// Retour vers l'app mobile via deep link
	if (appReturnUrl) {
		const deepLink = `${appReturnUrl}?status=${status}&listingId=${encodeURIComponent(listingId)}`;
		return new Response(
			`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Retour vers l'app…</title>
  <script>window.location.replace(${JSON.stringify(deepLink)});</script>
  <meta http-equiv="refresh" content="0;url=${deepLink}" />
</head>
<body style="font-family:sans-serif;text-align:center;padding-top:80px">
  <p>Redirection vers l'application…</p>
  <p><a href="${deepLink}">Appuyer ici si la redirection ne fonctionne pas</a></p>
</body>
</html>`,
			{ headers: { "Content-Type": "text/html; charset=utf-8" } },
		);
	}

	// Retour web
	const webTarget = listingId
		? `/listing/${listingId}?boostStatus=${status}`
		: "/";
	return Response.redirect(webTarget, 302);
}

async function activateBoost(reference: string): Promise<void> {
	const payload = await getPayload({ config });
	const paymentId = reference.replace(/^BOOST-/, "");

	const payment = await payload
		.findByID({ collection: "boost-payments", id: paymentId })
		.catch(() => null);

	if (!payment || payment.status === "completed") return; // idempotent

	await payload.update({
		collection: "boost-payments",
		id: paymentId,
		data: { status: "completed" },
	});

	const days = Number.parseInt(String(payment.duration), 10);
	const boostedUntil = new Date();
	boostedUntil.setDate(boostedUntil.getDate() + days);

	const listingId =
		typeof payment.listing === "object"
			? (payment.listing as { id: string }).id
			: String(payment.listing);

	await payload.update({
		collection: "listings",
		id: listingId,
		data: { boostedUntil: boostedUntil.toISOString() },
	});
}
