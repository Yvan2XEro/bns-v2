import type { Payload } from "payload";
import type { SmsMessagePayload } from "@/utils/sms/types";

export type ConsoleCredentials = {
	logger: Payload["logger"];
};

/**
 * Development-only provider: writes the message through the Payload logger
 * instead of sending it, so an admin can select it on a deployment with no
 * SMS credentials and still read the code from `docker compose logs api`.
 * Needs no credentials and never reaches a real carrier — selecting it in
 * production means nobody ever receives an SMS, which fails loudly rather
 * than quietly leaking codes into a log.
 */
export const consoleProvider = async (
	payload: SmsMessagePayload,
	credentials: ConsoleCredentials,
) => {
	credentials.logger.info(
		`[console SMS provider] to ${payload.to}: ${payload.message}`,
	);

	return { delivered: false, provider: "console" as const, to: payload.to };
};
