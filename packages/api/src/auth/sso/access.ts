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
	/** Logto's organization roles, as "organizationId:roleName". */
	organization_roles?: unknown;
}

export type SsoAccess =
	| { allowed: true; subject: string; email: string | null }
	| { allowed: false; reason: "no_subject" }
	/** `received`: the role names that did come, for the refusal's log. */
	| { allowed: false; reason: "missing_role"; received: string[] };

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

/** Every role the claims grant: user roles, and organization roles by name. */
export function grantedRoles(claims: SsoClaims): string[] {
	const organizationRoles = roleNames(claims.organization_roles).map((role) =>
		role.slice(role.indexOf(":") + 1),
	);
	return [...new Set([...roleNames(claims.roles), ...organizationRoles])];
}

export function ssoAccess(claims: SsoClaims, requiredRole: string): SsoAccess {
	if (typeof claims.sub !== "string" || !claims.sub) {
		return { allowed: false, reason: "no_subject" };
	}
	const granted = grantedRoles(claims);
	if (!granted.includes(requiredRole)) {
		return { allowed: false, reason: "missing_role", received: granted };
	}
	// Only an address the provider vouches for may find the account to link.
	const email =
		claims.email_verified === true && typeof claims.email === "string"
			? claims.email.trim().toLowerCase()
			: null;
	return { allowed: true, subject: claims.sub, email };
}
