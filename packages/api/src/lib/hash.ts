import { createHash, createHmac } from "node:crypto";
import { ERROR_CODES } from "./errors";
import { ServiceError } from "./serviceError";

export function sha256(data: Buffer | Uint8Array | string): string {
	return createHash("sha256").update(data).digest("hex");
}

/**
 * Keyed hash for values that must be comparable but never recoverable: the
 * identity-document number and a reviewer's IP. An unkeyed SHA-256 of a
 * 9-digit CNI number is brute-forceable in seconds, so the pepper is what
 * makes the stored value useless to anyone who takes the database.
 *
 * Throwing on an empty pepper is deliberate: hashing with an empty key would
 * produce something that looks right and protects nothing. The throw is a
 * declared `ServiceError` rather than a bare `Error`: a route that already
 * handles service refusals (`handleModerationError`) turns this into a
 * translated `verification.hashUnavailable` response instead of an
 * unclassified 500, and `processKycEvent`'s handler recognises the same code
 * to stop retrying a misconfiguration retrying can never fix.
 */
export function peppered(value: string): string {
	const pepper = process.env.VERIFICATION_HASH_PEPPER ?? "";
	if (!pepper) {
		throw new ServiceError(
			ERROR_CODES.verificationHashUnavailable,
			500,
			"VERIFICATION_HASH_PEPPER is not set; refusing to hash with an empty key",
		);
	}
	return createHmac("sha256", pepper).update(value).digest("hex");
}
