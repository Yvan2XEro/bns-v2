import type { SmsMessagePayload } from "@/utils/sms/types";

export type AvlytextCredentials = {
	apiKey: string;
	sender?: string;
};

export const avlytextProvider = async (
	payload: SmsMessagePayload,
	credentials: AvlytextCredentials,
) => {
	if (!credentials.apiKey) {
		throw new Error("AvlyText API key is missing");
	}

	const response = await fetch(
		`https://api.avlytext.com/v1/sms?api_key=${credentials.apiKey}`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				sender: credentials.sender || payload.from,
				recipient: payload.to,
				text: payload.message,
			}),
		},
	);

	if (!response.ok) {
		throw new Error(
			`AvlyText SMS error: ${response.status} ${response.statusText}`,
		);
	}

	return response.json();
};
