import { getProvider } from "@/lib/payments";
import { processBoostPayment } from "../notchpay/route";

export async function POST(request: Request) {
	const rawBody = await request.text();
	const headers = Object.fromEntries(request.headers.entries());

	try {
		const provider = getProvider("stripe");
		const event = await provider.verifyWebhook(rawBody, headers);
		await processBoostPayment(event.reference, event.status);
		// Always return 200 to Stripe — retries stop on non-2xx
		return Response.json({ received: true });
	} catch (err) {
		console.error("Stripe webhook error:", err);
		const msg = err instanceof Error ? err.message : "";
		if (msg.includes("signature")) {
			return Response.json({ error: "Invalid signature" }, { status: 400 });
		}
		// Still 200 so Stripe doesn't keep retrying configuration errors
		return Response.json({ received: true });
	}
}
