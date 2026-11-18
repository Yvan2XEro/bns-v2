import { handleMarketplaceWebhook } from "@/lib/paymentWebhookRoute";

// P0's URL stays registered with NotchPay; it feeds the same spine as
// /api/public/payments/webhook/notchpay.
export function POST(request: Request) {
	return handleMarketplaceWebhook(request);
}
