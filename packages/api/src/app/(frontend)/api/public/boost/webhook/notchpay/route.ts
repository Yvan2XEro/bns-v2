import { handlePaymentWebhook } from "@/lib/paymentWebhookRoute";

export function POST(request: Request) {
	return handlePaymentWebhook("notchpay", request);
}
