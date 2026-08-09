import { createHmac, timingSafeEqual } from "node:crypto";
import config from "@payload-config";
import { getPayload } from "payload";
import { activateBoostPayment } from "@/lib/boostPayments";

interface NotchPayWebhookEvent {
	id: string;
	event: string;
	data: {
		merchant_reference: string;
		trxref: string;
		reference: string;
		amount: number;
		currency: string;
		status: string;
		customer: string;
		created_at: string;
		updated_at?: string;
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

	// merchant_reference is our "BOOST-{id}", trxref is a fallback
	const reference = event.data?.merchant_reference || event.data?.trxref || "";
	const eventType = event.event ?? "";

	console.log(
		`[NotchPay webhook] Received — event: ${eventType}, reference: ${reference}, status: ${event.data?.status}`,
	);

	if (eventType === "payment.complete") {
		await activateBoost(reference).catch((err) =>
			console.error("[NotchPay webhook] activateBoost error:", err),
		);
	} else if (
		eventType === "payment.failed" ||
		eventType === "payment.cancelled"
	) {
		await markBoostFailed(reference).catch((err) =>
			console.error("[NotchPay webhook] markBoostFailed error:", err),
		);
	} else {
		console.log(`[NotchPay webhook] Ignored event type: ${eventType}`);
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
	console.log(
		`[NotchPay webhook] Looking up payment — reference: ${reference}`,
	);
	const activation = await activateBoostPayment({
		payload,
		candidateReferences: [reference],
	});

	if (!activation) {
		console.error(
			`[NotchPay webhook] Payment could not be resolved for reference: ${reference}`,
		);
		return;
	}

	console.log(
		`[NotchPay webhook] Boost activated — listing: ${activation.listingId}, boostedUntil: ${activation.boostedUntil}`,
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
