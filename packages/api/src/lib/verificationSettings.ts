import type { Payload } from "payload";

export interface VerificationSettings {
	enabled: boolean;
	kycProvider: "didit" | "smileid";
	autoApproveIdentity: boolean;
	consentVersion: string | null;
}

interface AuthorisationInput {
	reference?: unknown;
	grantedAt?: unknown;
	transfersAuthorised?: unknown;
	consentVersion?: unknown;
}

const filled = (value: unknown): boolean =>
	typeof value === "string" ? value.trim().length > 0 : Boolean(value);

/**
 * Law 2024/017: the feature cannot be switched on before the authorisation to
 * process and transfer identity data is recorded here. Returns the refusal
 * message, or null when the change is allowed.
 *
 * `env` is passed in rather than read from `process.env` so the production
 * rule is a test case, not a thing you have to believe.
 */
export function assertAuthorised(
	verification: { enabled?: unknown; authorisation?: AuthorisationInput },
	env: { VERIFICATION_ALLOW_UNAUTHORISED?: string; NODE_ENV?: string },
): string | null {
	if (verification.enabled !== true) return null;

	const bypass =
		env.VERIFICATION_ALLOW_UNAUTHORISED === "true" &&
		env.NODE_ENV !== "production";
	if (bypass) return null;

	const a = verification.authorisation ?? {};
	const missing: Array<
		"reference" | "grantedAt" | "consentVersion" | "transfersAuthorised"
	> = (["reference", "grantedAt", "consentVersion"] as const).filter(
		(key) => !filled(a[key]),
	);
	if (a.transfersAuthorised !== true) missing.push("transfersAuthorised");
	if (missing.length === 0) return null;

	return `Verification cannot be enabled until the Law 2024/017 authorisation is recorded: missing ${missing.join(", ")}.`;
}

/** Fails closed: an unreadable settings global means verification stays off. */
export async function getVerificationSettings(
	payload: Payload,
): Promise<VerificationSettings> {
	try {
		const settings = await payload.findGlobal({
			slug: "app-settings",
			depth: 0,
			overrideAccess: true,
		});
		const v = (settings as { verification?: Record<string, unknown> })
			.verification;
		const provider = v?.kycProvider;
		const consent = (
			v?.authorisation as { consentVersion?: unknown } | undefined
		)?.consentVersion;
		return {
			enabled: v?.enabled === true,
			kycProvider: provider === "smileid" ? "smileid" : "didit",
			autoApproveIdentity: v?.autoApproveIdentity === true,
			consentVersion: typeof consent === "string" && consent ? consent : null,
		};
	} catch {
		return {
			enabled: false,
			kycProvider: "didit",
			autoApproveIdentity: false,
			consentVersion: null,
		};
	}
}
