import { createHmac, timingSafeEqual } from "node:crypto";
import config from "@payload-config";
import { getPayload } from "payload";

interface NotchPayWebhookEvent {
	id: string;
	type: string;
	created_at: string;
	data: {
		id: string;
		reference: string;
		amount: number;
		currency: string;
		status: string;
		customer: string;
		created_at: string;
		completed_at?: string;
	};
}

export async function POST(request: Request) {
	const rawBody = await request.text();
	const headers = Object.fromEntries(request.headers.entries());

	const hashKey = process.env.NOTCHPAY_HASH_KEY;
	if (!hashKey) {
		console.error("[NotchPay webhook] NOTCHPAY_HASH_KEY not configured");
		return Response.json({ error: "Configuration manquante" }, { status: 500 });
	}

	// Vérification de la signature HMAC-SHA256
	const signature = headers["x-notch-signature"];
	if (!signature) {
		console.warn("[NotchPay webhook] Missing signature header");
		return Response.json({ error: "Signature manquante" }, { status: 400 });
	}

	const expected = createHmac("sha256", hashKey).update(rawBody).digest("hex");

	try {
		const sigBuf = Buffer.from(signature, "hex");
		const expBuf = Buffer.from(expected, "hex");
		if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
			console.warn(
				`[NotchPay webhook] Invalid signature — received: ${signature}, expected: ${expected}`,
			);
			return Response.json({ error: "Signature invalide" }, { status: 400 });
		}
	} catch {
		console.warn("[NotchPay webhook] Signature verification error");
		return Response.json({ error: "Signature invalide" }, { status: 400 });
	}

	let event: NotchPayWebhookEvent;
	try {
		event = JSON.parse(rawBody) as NotchPayWebhookEvent;
	} catch {
		console.error("[NotchPay webhook] Invalid JSON payload");
		return Response.json({ error: "Payload invalide" }, { status: 400 });
	}

	const reference = event.data?.reference ?? "";
	console.log(
		`[NotchPay webhook] Received — type: ${event.type}, reference: ${reference}, status: ${event.data?.status}`,
	);

	if (event.type === "payment.complete") {
		await activateBoost(reference).catch((err) =>
			console.error("[NotchPay webhook] activateBoost error:", err),
		);
	} else if (
		event.type === "payment.failed" ||
		event.type === "payment.cancelled"
	) {
		await markBoostFailed(reference).catch((err) =>
			console.error("[NotchPay webhook] markBoostFailed error:", err),
		);
	} else {
		console.log(`[NotchPay webhook] Ignored event type: ${event.type}`);
	}

	return Response.json({ received: true });
}

async function activateBoost(reference: string): Promise<void> {
	if (!reference) {
		console.warn(
			"[NotchPay webhook] activateBoost called with empty reference",
		);
		return;
	}

	const payload = await getPayload({ config });
	const paymentId = reference.replace(/^BOOST-/, "");
	console.log(
		`[NotchPay webhook] Looking up payment — reference: ${reference}, paymentId: ${paymentId}`,
	);

	const payment = await payload
		.findByID({ collection: "boost-payments", id: paymentId })
		.catch(() => null);

	if (!payment) {
		console.error(
			`[NotchPay webhook] Payment not found for paymentId: ${paymentId}`,
		);
		return;
	}

	if (payment.status === "completed") {
		console.log(
			`[NotchPay webhook] Payment ${paymentId} already completed, skipping`,
		);
		return;
	}

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

	console.log(
		`[NotchPay webhook] Boost activated — listing: ${listingId}, boostedUntil: ${boostedUntil.toISOString()}`,
	);
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
	console.log(`[NotchPay webhook] Payment marked as failed: ${paymentId}`);
}
