export interface SmsMessagePayload {
	from?: string;
	message: string;
	to: string;
}

export type SmsProviderSlug = "avlytext" | "mtarget";
