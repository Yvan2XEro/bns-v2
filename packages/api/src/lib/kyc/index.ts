import { ERROR_CODES } from "../errors";
import { ServiceError } from "../serviceError";
import { diditProvider } from "./didit";
import type { KycProvider } from "./types";

/**
 * Smile ID is the fallback if Didit fails the vendor checklist. Adding it is a
 * new file behind this interface and a switch of
 * `AppSettings.verification.kycProvider` — nothing else changes.
 */
export function getKycProvider(
	name: "manual" | "didit" | "smileid",
): KycProvider {
	// "manual" has no vendor session: the seller uploads documents instead.
	if (name === "didit") return diditProvider;
	throw new ServiceError(ERROR_CODES.verificationKycUnavailable, 503);
}
