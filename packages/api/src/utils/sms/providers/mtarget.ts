import type { SmsMessagePayload } from "@/utils/sms/types";

export type MtargetCredentials = {
	apiKey: string;
	sender?: string;
};

export const mtargetProvider = async (
	payload: SmsMessagePayload,
	credentials: MtargetCredentials,
) => {
	if (!credentials.apiKey) {
		throw new Error("MTarget API key is missing");
	}

	const response = await fetch("https://api-public-2.mtarget.fr/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
			"X-API-KEY": credentials.apiKey,
		},
		body: JSON.stringify({
			msg: payload.message,
			msisdn: payload.to,
			sender: credentials.sender || payload.from,
		}),
	});

	if (!response.ok) {
		throw new Error(
			`MTarget SMS error: ${response.status} ${response.statusText}`,
		);
	}

	return response.json();
};
