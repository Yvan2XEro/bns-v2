import config from "@payload-config";
import { getPayload } from "payload";
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
	const paymentId = reference.replace(/^BOOST-/, "");

	const payment = await payload
		.findByID({ collection: "boost-payments", id: paymentId })
		.catch(() => null);

	if (!payment || payment.status === "completed") return;

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
