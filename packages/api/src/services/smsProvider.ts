import type { Payload } from "payload";
import { avlytextProvider } from "@/utils/sms/providers/avlytext";
import { mtargetProvider } from "@/utils/sms/providers/mtarget";
import type { SmsMessagePayload, SmsProviderSlug } from "@/utils/sms/types";

type AppSettings = {
	sms?: {
		avlytext?: {
			apiKey?: null | string;
			sender?: null | string;
		};
		defaultSender?: null | string;
		mtarget?: {
			apiKey?: null | string;
			sender?: null | string;
		};
		provider?: SmsProviderSlug;
	};
};

async function getAppSettings(payload: Payload): Promise<AppSettings> {
	return (await payload.findGlobal({
		depth: 0,
		overrideAccess: true,
		slug: "app-settings",
	})) as AppSettings;
}

export async function sendSms(
	payloadClient: Payload,
	message: SmsMessagePayload,
): Promise<unknown> {
	const settings = await getAppSettings(payloadClient);
	const smsSettings = settings.sms;

	if (!smsSettings?.provider) {
		throw new Error("SMS provider is not configured");
	}

	const from = smsSettings.defaultSender || message.from;
	const payload = { ...message, from };

	switch (smsSettings.provider) {
		case "avlytext":
			return avlytextProvider(payload, {
				apiKey: smsSettings.avlytext?.apiKey || "",
				sender: smsSettings.avlytext?.sender || undefined,
			});
		case "mtarget":
			return mtargetProvider(payload, {
				apiKey: smsSettings.mtarget?.apiKey || "",
				sender: smsSettings.mtarget?.sender || undefined,
			});
		default:
			throw new Error("Unsupported SMS provider configuration");
	}
}
