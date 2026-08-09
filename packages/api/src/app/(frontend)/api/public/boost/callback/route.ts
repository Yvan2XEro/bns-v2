import config from "@payload-config";
import { getPayload } from "payload";
import { activateBoostPayment } from "@/lib/boostPayments";
import { getNotchPayProvider } from "@/lib/payments";

/**
 * Callback GET après paiement (NotchPay et Stripe Checkout).
 * Query params : provider, listingId, appReturnUrl
 *   NotchPay ajoute aussi : reference
 *   Stripe ajoute aussi  : status (success|cancelled)
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const provider = url.searchParams.get("provider") ?? "notchpay";
	const reference = url.searchParams.get("reference") ?? "";
	const trxref = url.searchParams.get("trxref") ?? "";
	const appReturnUrl = url.searchParams.get("appReturnUrl") ?? "";
	const listingId = url.searchParams.get("listingId") ?? "";

	let status = "failed";

	if (provider === "stripe") {
		// L'activation est gérée par le webhook Stripe ; on relaie juste le statut
		const stripeStatus = url.searchParams.get("status") ?? "";
		status = stripeStatus === "success" ? "success" : "failed";
	} else {
		// NotchPay : vérifier le paiement et activer le boost
		if (reference) {
			try {
				const notchpay = getNotchPayProvider();
				const paymentStatus = await notchpay.verifyPayment(reference);

				if (paymentStatus === "completed") {
					const activated = await activateBoost({
						providerReference: reference,
						internalReference: trxref,
					});
					status = activated ? "success" : "failed";
				} else if (paymentStatus === "pending") {
					status = "pending";
				}
			} catch (err) {
				console.error("NotchPay callback error:", err);
			}
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

	// Retour web — redirection vers le frontend (pas le backend)
	const webUrl = process.env.PUBLIC_WEB_URL ?? "http://localhost:3001";
	const webPath = listingId
		? `/listing/${listingId}?boostStatus=${status}`
		: "/";
	return Response.redirect(`${webUrl}${webPath}`, 302);
}

async function activateBoost({
	providerReference,
	internalReference,
}: {
	providerReference: string;
	internalReference?: string;
}): Promise<boolean> {
	const payload = await getPayload({ config });
	const activation = await activateBoostPayment({
		payload,
		candidateReferences: [internalReference, providerReference],
	});
	return Boolean(activation);
}
