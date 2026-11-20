import { handleCamPayWebhook } from "@/lib/paymentWebhookRoute";

// The callback URL registered on the CamPay app. CamPay sends GET (query
// parameters) or POST (body), whichever the app is set to: both land here.
export function GET(request: Request) {
	return handleCamPayWebhook(request);
}

export function POST(request: Request) {
	return handleCamPayWebhook(request);
}
