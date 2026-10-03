import { handleMarketplaceWebhook } from "@/lib/paymentWebhookRoute";

export function POST(request: Request) {
	return handleMarketplaceWebhook(request);
}
