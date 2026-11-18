import type { Payload } from "payload";

export type KycProviderSetting = "manual" | "didit" | "smileid";

export interface VerificationSettings {
	enabled: boolean;
	/** "manual" is free: documents uploaded by the seller, checked by a moderator. */
	kycProvider: KycProviderSetting;
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

/** How a level-2 identity check is carried out, as a client needs to know it. */
export function identityMethod(
	settings: Pick<VerificationSettings, "kycProvider">,
): "manual" | "vendor" {
	return settings.kycProvider === "manual" ? "manual" : "vendor";
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
			// An unset value is the free manual review, like the field's default:
			// a paid vendor is only ever used once someone picked it.
			kycProvider:
				provider === "didit" || provider === "smileid" ? provider : "manual",
			autoApproveIdentity: v?.autoApproveIdentity === true,
			// Trimmed like the version a client sends back (kyc-session's body
			// schema): a stray space typed in the admin otherwise refused
			// every consent, the form unticking itself in a loop.
			consentVersion:
				typeof consent === "string" && consent.trim() ? consent.trim() : null,
		};
	} catch {
		return {
			enabled: false,
			kycProvider: "manual",
			autoApproveIdentity: false,
			consentVersion: null,
		};
	}
}
