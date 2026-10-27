/**
 * Who may enter the panel through the SSO, decided from the identity
 * provider's claims alone (pure, so every rule is tested). The account side
 * — an existing BuyNSellem admin — is checked in `users.ts`.
 */

export interface SsoClaims {
	sub?: unknown;
	email?: unknown;
	email_verified?: unknown;
	roles?: unknown;
}

export type SsoAccess =
	| { allowed: true; subject: string; email: string | null }
	| { allowed: false; reason: "no_subject" | "missing_role" };

/** Logto sends role names; other providers may send `{ name }` objects. */
function roleNames(roles: unknown): string[] {
	if (!Array.isArray(roles)) return [];
	return roles.flatMap((role) => {
		if (typeof role === "string") return [role];
		if (
			role &&
			typeof role === "object" &&
			"name" in role &&
			typeof role.name === "string"
		) {
			return [role.name];
		}
		return [];
	});
}

export function ssoAccess(claims: SsoClaims, requiredRole: string): SsoAccess {
	if (typeof claims.sub !== "string" || !claims.sub) {
		return { allowed: false, reason: "no_subject" };
	}
	if (!roleNames(claims.roles).includes(requiredRole)) {
		return { allowed: false, reason: "missing_role" };
	}
	// Only an address the provider vouches for may find the account to link.
	const email =
		claims.email_verified === true && typeof claims.email === "string"
			? claims.email.trim().toLowerCase()
			: null;
	return { allowed: true, subject: claims.sub, email };
}
