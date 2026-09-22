import config from "@payload-config";
import { getPayload } from "payload";
import { getProvider } from "@/lib/payments";
import { type SettleOutcome, settlePayment } from "@/services/payments";

type CallbackStatus = "success" | "pending" | "failed";

function callbackStatus(result: SettleOutcome): CallbackStatus {
	if (result.outcome === "unknown_reference") return "failed";
	const { status } = result.intent;
	if (status === "succeeded") return "success";
	if (status === "pending" || status === "created") return "pending";
	return "failed";
}

/**
 * GET redirect after a hosted checkout. It never activates anything by
 * itself: NotchPay payments are verified with the provider and go through
 * the same idempotent settlement as the webhook, in whichever order the two
 * arrive.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const provider = url.searchParams.get("provider") ?? "notchpay";
	const providerReference = url.searchParams.get("reference") ?? "";
	const appReturnUrl = url.searchParams.get("appReturnUrl") ?? "";
	const listingId = url.searchParams.get("listingId") ?? "";

	let status: CallbackStatus = "failed";

	if (provider === "stripe") {
		// L'activation est gérée par le webhook Stripe ; on relaie juste le statut
		status =
			url.searchParams.get("status") === "success" ? "success" : "failed";
	} else if (providerReference) {
		try {
			const payload = await getPayload({ config });
			const verified =
				await getProvider("notchpay").verifyPayment(providerReference);
			const result = await settlePayment(payload, {
				...verified,
				source: "callback",
			});
			status = callbackStatus(result);
		} catch (error) {
			console.error(
				"[boost callback] verification failed:",
				error instanceof Error ? error.message : error,
			);
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
