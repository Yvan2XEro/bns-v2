import { getPayload } from "payload";
import config from "@payload-config";

export async function POST(request: Request) {
	try {
		const payload = await getPayload({ config });
		const body = await request.json();
		const { listingId, duration, userId } = body;

		const listing = await payload.findByID({
			collection: "listings",
			id: listingId,
		});

		if (!listing) {
			return Response.json({ error: "Listing not found" }, { status: 404 });
		}

		const prices: Record<string, number> = {
			"7": 500,
			"14": 900,
			"30": 1500,
		};

		const amount = prices[duration] || 500;

		const boostPayment = await payload.create({
			collection: "boost-payments",
			data: {
				listing: listingId,
				user: userId,
				amount,
				duration,
				status: "pending",
				paymentProvider: "notchpay",
			},
		});

		const notchPayApiKey = process.env.NOTCHPAY_API_KEY;
		const notchPayBaseUrl =
			process.env.NOTCHPAY_BASE_URL || "https://api.notchpay.co";

		if (!notchPayApiKey) {
			return Response.json({
				paymentId: boostPayment.id,
				status: "pending",
				message: "Payment configuration missing",
			});
		}

		const paymentResponse = await fetch(`${notchPayBaseUrl}/payments`, {
			method: "POST",
			headers: {
				Authorization: notchPayApiKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				reference: `BOOST-${boostPayment.id}`,
				amount: amount,
				currency: "XAF",
				description: `Boost listing: ${listing.title}`,
				callback_url: `${process.env.PAYLOAD_PUBLIC_SERVER_URL}/api/public/boost/webhook`,
				customer: {
					email:
						(listing.seller as unknown as { email?: string })?.email ||
						"user@example.com",
				},
			}),
		});

		const paymentData = await paymentResponse.json();

		if (paymentData.checkout_url) {
			await payload.update({
				collection: "boost-payments",
				id: boostPayment.id,
				data: {
					paymentReference: paymentData.reference,
					paymentUrl: paymentData.checkout_url,
				},
			});
		}

		return Response.json({
			paymentId: boostPayment.id,
			paymentUrl: paymentData.checkout_url,
			paymentReference: paymentData.reference,
		});
	} catch (error) {
		console.error("Boost payment error:", error);
		return Response.json(
			{ error: "Failed to create payment" },
			{ status: 500 },
		);
	}
}
