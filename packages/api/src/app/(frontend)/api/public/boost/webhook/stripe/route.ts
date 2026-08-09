import config from "@payload-config";
import { getPayload } from "payload";
import { activateBoostPayment } from "@/lib/boostPayments";
import { getProvider } from "@/lib/payments";

export async function POST(request: Request) {
	const rawBody = await request.text();
	const headers = Object.fromEntries(request.headers.entries());

	try {
		const provider = getProvider("stripe");
		const event = await provider.verifyWebhook(rawBody, headers);

		if (event.status === "completed") {
			await activateBoost(event.reference);
		} else if (event.status === "failed" || event.status === "cancelled") {
			await markBoostFailed(event.reference);
		}

		// Stripe attend toujours un 200 — sinon il retente
		return Response.json({ received: true });
	} catch (err) {
		console.error("Stripe webhook error:", err);
		const msg = err instanceof Error ? err.message : "";
		if (msg.includes("signature")) {
			return Response.json({ error: "Invalid signature" }, { status: 400 });
		}
		return Response.json({ received: true });
	}
}

async function activateBoost(reference: string): Promise<void> {
	if (!reference) return;
	const payload = await getPayload({ config });
	await activateBoostPayment({
		payload,
		candidateReferences: [reference],
	});
}

async function markBoostFailed(reference: string): Promise<void> {
	if (!reference) return;
	const payload = await getPayload({ config });
	const paymentId = reference.replace(/^BOOST-/, "");
	await payload
		.update({
			collection: "boost-payments",
			id: paymentId,
			data: { status: "failed" },
		})
		.catch(() => null);
}
