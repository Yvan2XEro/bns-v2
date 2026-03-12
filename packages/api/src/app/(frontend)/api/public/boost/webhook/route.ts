import config from "@payload-config";
import { getPayload } from "payload";

export async function POST(request: Request) {
	try {
		const payload = await getPayload({ config });
		const body = await request.json();

		const { reference, status } = body;

		if (!reference) {
			return Response.json({ error: "Missing reference" }, { status: 400 });
		}

		const paymentId = reference.replace("BOOST-", "");

		const payment = await payload.findByID({
			collection: "boost-payments",
			id: paymentId,
		});

		if (!payment) {
			return Response.json({ error: "Payment not found" }, { status: 404 });
		}

		if (status === "approved" || status === "completed") {
			await payload.update({
				collection: "boost-payments",
				id: paymentId,
				data: {
					status: "completed",
				},
			});

			const duration = Number.parseInt(payment.duration as string, 10);
			const boostedUntil = new Date();
			boostedUntil.setDate(boostedUntil.getDate() + duration);

			await payload.update({
				collection: "listings",
				id: String(payment.listing),
				data: {
					boostedUntil: boostedUntil.toISOString(),
				},
			});

			return Response.json({ success: true });
		}

		if (status === "failed" || status === "cancelled") {
			await payload.update({
				collection: "boost-payments",
				id: paymentId,
				data: {
					status: "failed",
				},
			});
		}

		return Response.json({ received: true });
	} catch (error) {
		console.error("Webhook error:", error);
		return Response.json(
			{ error: "Webhook processing failed" },
			{ status: 500 },
		);
	}
}
