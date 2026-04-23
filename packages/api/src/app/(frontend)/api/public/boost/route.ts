import config from "@payload-config";
import { getPayload } from "payload";
import { getProvider, type ProviderName } from "@/lib/payments";

const PRICES: Record<string, number> = {
	"7": 500,
	"14": 900,
	"30": 1500,
};

export async function POST(request: Request) {
	try {
		const payload = await getPayload({ config });
		const { user } = await payload.auth({ headers: request.headers });
		if (!user) {
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = (await request.json()) as {
			listingId?: string;
			duration?: "7" | "14" | "30";
			provider?: ProviderName;
			/** Deep-link base URL, e.g. "buynsellem://boost/callback" */
			returnUrl?: string;
		};

		const {
			listingId,
			duration,
			provider: providerName = "notchpay",
			returnUrl,
		} = body;

		if (!listingId || !duration || !PRICES[duration]) {
			return Response.json(
				{ error: "Missing or invalid listingId / duration" },
				{ status: 400 },
			);
		}

		const listing = await payload.findByID({
			collection: "listings",
			id: listingId,
		});

		if (!listing) {
			return Response.json({ error: "Listing not found" }, { status: 404 });
		}

		const sellerId =
			typeof listing.seller === "object" ? listing.seller?.id : listing.seller;

		if (sellerId !== user.id) {
			return Response.json({ error: "Forbidden" }, { status: 403 });
		}

		const amount = PRICES[duration]!;
		const serverUrl = process.env.PAYLOAD_PUBLIC_SERVER_URL ?? "";

		// Resolve provider — fall back to notchpay if requested provider is not configured
		let provider: ReturnType<typeof getProvider>;
		try {
			provider = getProvider(providerName);
		} catch {
			provider = getProvider("notchpay");
		}

		const boostPayment = await payload.create({
			collection: "boost-payments",
			data: {
				listing: listingId,
				user: user.id,
				amount,
				duration,
				status: "pending",
				paymentProvider: provider.id as "notchpay" | "stripe",
			},
		});

		const reference = `BOOST-${boostPayment.id}`;
		const callbackUrl = `${serverUrl}/api/public/boost/webhook/${provider.id}`;

		// For browser-redirect flows: proxy the deep-link return through our server
		// so the browser can safely open a custom URL scheme.
		let resolvedReturnUrl: string | undefined;
		if (returnUrl) {
			const ret = new URL(`${serverUrl}/api/public/boost/return`);
			ret.searchParams.set("appReturnUrl", returnUrl);
			ret.searchParams.set("listingId", listingId);
			resolvedReturnUrl = ret.toString();
		}

		const result = await provider.createPayment({
			reference,
			amount,
			currency: "XAF",
			description: `Boost annonce: ${listing.title}`,
			callbackUrl,
			returnUrl: resolvedReturnUrl,
			customer: { email: user.email },
		});

		await payload.update({
			collection: "boost-payments",
			id: boostPayment.id,
			data: {
				paymentReference: result.providerReference,
				paymentUrl: result.checkoutUrl ?? null,
			},
		});

		return Response.json({
			paymentId: boostPayment.id,
			provider: provider.id,
			checkoutUrl: result.checkoutUrl,
			clientSecret: result.clientSecret ?? null,
		});
	} catch (err) {
		console.error("Boost payment error:", err);
		return Response.json(
			{ error: "Failed to create payment" },
			{ status: 500 },
		);
	}
}
