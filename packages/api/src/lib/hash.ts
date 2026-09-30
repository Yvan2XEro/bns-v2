import { createHash, createHmac } from "node:crypto";

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
 * produce something that looks right and protects nothing.
 */
export function peppered(value: string): string {
	const pepper = process.env.VERIFICATION_HASH_PEPPER ?? "";
	if (!pepper) {
		throw new Error(
			"VERIFICATION_HASH_PEPPER is not set; refusing to hash with an empty key",
		);
	}
	return createHmac("sha256", pepper).update(value).digest("hex");
}
