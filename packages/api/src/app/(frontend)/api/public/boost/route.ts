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
			/** Deep-link base URL, ex: "buynsellem://boost/callback" */
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
				{ error: "listingId et duration (7|14|30) sont requis" },
				{ status: 400 },
			);
		}

		const listing = await payload.findByID({
			collection: "listings",
			id: listingId,
		});

		if (!listing) {
			return Response.json({ error: "Annonce introuvable" }, { status: 404 });
		}

		const sellerId =
			typeof listing.seller === "object" ? listing.seller?.id : listing.seller;

		if (sellerId !== user.id) {
			return Response.json({ error: "Forbidden" }, { status: 403 });
		}

		const amount = PRICES[duration]!;
		const serverUrl = process.env.PAYLOAD_PUBLIC_SERVER_URL ?? "";

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

		// Pour NotchPay : le callback est une redirection GET vers notre serveur.
		// On y inclut appReturnUrl et listingId pour le retour vers l'app.
		const callbackUrl = buildNotchPayCallbackUrl(
			serverUrl,
			listingId,
			returnUrl,
		);

		// Pour Stripe : le webhook est un POST vers notre endpoint dédié.
		const stripeWebhookUrl = `${serverUrl}/api/public/boost/webhook/stripe`;

		const result = await provider.createPayment({
			reference,
			amount,
			currency: "XAF",
			description: `Boost annonce: ${listing.title}`,
			callbackUrl: provider.id === "stripe" ? stripeWebhookUrl : callbackUrl,
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
		return Response.json({ error: "Erreur lors du paiement" }, { status: 500 });
	}
}

function buildNotchPayCallbackUrl(
	serverUrl: string,
	listingId: string,
	appReturnUrl: string | undefined,
): string {
	const url = new URL(`${serverUrl}/api/public/boost/callback`);
	url.searchParams.set("listingId", listingId);
	if (appReturnUrl) {
		url.searchParams.set("appReturnUrl", appReturnUrl);
	}
	// NotchPay ajoute automatiquement ?reference=xxx à cette URL
	return url.toString();
}
