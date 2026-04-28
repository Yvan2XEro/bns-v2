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
		console.error("NotchPay webhook: NOTCHPAY_HASH_KEY non configuré");
		return Response.json({ error: "Configuration manquante" }, { status: 500 });
	}

	// Vérification de la signature HMAC-SHA256
	const signature = headers["x-notch-signature"];
	if (!signature) {
		return Response.json({ error: "Signature manquante" }, { status: 400 });
	}

	const expected = createHmac("sha256", hashKey).update(rawBody).digest("hex");

	try {
		const sigBuf = Buffer.from(signature, "hex");
		const expBuf = Buffer.from(expected, "hex");
		if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
			return Response.json({ error: "Signature invalide" }, { status: 400 });
		}
	} catch {
		return Response.json({ error: "Signature invalide" }, { status: 400 });
	}

	let event: NotchPayWebhookEvent;
	try {
		event = JSON.parse(rawBody) as NotchPayWebhookEvent;
	} catch {
		return Response.json({ error: "Payload invalide" }, { status: 400 });
	}

	const reference = event.data?.reference ?? "";

	if (event.type === "payment.complete") {
		await activateBoost(reference).catch((err) =>
			console.error("NotchPay webhook activateBoost error:", err),
		);
	} else if (
		event.type === "payment.failed" ||
		event.type === "payment.cancelled"
	) {
		await markBoostFailed(reference).catch((err) =>
			console.error("NotchPay webhook markBoostFailed error:", err),
		);
	}

	return Response.json({ received: true });
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
