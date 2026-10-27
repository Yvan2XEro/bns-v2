import type { Payload } from "payload";
import type { User } from "@/payload-types";
import { isAdmin, isSuspended } from "../../access/roles";

/** A BuyNSellem administrator, not suspended: the only account the SSO opens. */
function assertMayEnter(user: User): void {
	if (!isAdmin(user)) throw new Error("not_an_admin");
	if (isSuspended(user)) throw new Error("account_suspended");
}

/** How an account remembers its SSO identity, among its provider links. */
const PROVIDER = "oidc" as const;

/**
 * The BuyNSellem account an SSO identity signs in to. Never creates one, and
 * only ever an admin: the identity provider proves who it is, BuyNSellem
 * decides what that person may do. Found by the identity once linked, else
 * by the address the provider vouches for, then linked to that identity.
 */
export async function resolveSsoUser(
	payload: Payload,
	identity: { subject: string; email: string | null },
): Promise<User> {
	const linked = await payload.find({
		collection: "users",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		where: {
			and: [
				{ "authProviders.provider": { equals: PROVIDER } },
				{ "authProviders.providerAccountId": { equals: identity.subject } },
			],
		},
	});
	const linkedUser = linked.docs[0];
	if (linkedUser) {
		assertMayEnter(linkedUser);
		return linkedUser;
	}

	if (!identity.email) throw new Error("no_verified_email");
	const byEmail = await payload.find({
		collection: "users",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		where: { email: { equals: identity.email } },
	});
	const user = byEmail.docs[0];
	if (!user) throw new Error("no_account");
	assertMayEnter(user);

	return (await payload.update({
		collection: "users",
		id: user.id,
		depth: 0,
		overrideAccess: true,
		context: { oauthFlow: true },
		data: {
			authProviders: [
				...(user.authProviders ?? []),
				{ provider: PROVIDER, providerAccountId: identity.subject },
			],
		},
	})) as User;
}
