import config from "@payload-config";
import { getPayload } from "payload";
import { getProvider } from "@/lib/payments";

export async function POST(request: Request) {
	const rawBody = await request.text();
	const headers = Object.fromEntries(request.headers.entries());

	try {
		const provider = getProvider("notchpay");
		const event = await provider.verifyWebhook(rawBody, headers);
		await processBoostPayment(event.reference, event.status);
		return Response.json({ received: true });
	} catch (err) {
		console.error("NotchPay webhook error:", err);
		const msg = err instanceof Error ? err.message : "";
		if (msg.includes("signature")) {
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
		return Response.json({ error: "Webhook error" }, { status: 500 });
	}
}

export async function processBoostPayment(
	reference: string,
	status: string,
): Promise<void> {
	if (!reference) throw new Error("Missing reference");

	const payload = await getPayload({ config });
	const paymentId = reference.replace(/^BOOST-/, "");

	const payment = await payload.findByID({
		collection: "boost-payments",
		id: paymentId,
	});
	if (!payment) throw new Error(`Payment not found: ${paymentId}`);
	if (payment.status === "completed") return; // idempotent

	if (status === "completed") {
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
	} else if (status === "failed" || status === "cancelled") {
		await payload.update({
			collection: "boost-payments",
			id: paymentId,
			data: { status: "failed" },
		});
	}
}
