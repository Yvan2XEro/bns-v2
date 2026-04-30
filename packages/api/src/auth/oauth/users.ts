import { randomBytes } from "node:crypto";
import type { Payload, RequiredDataFromCollectionSlug } from "payload";
import type { User } from "@/payload-types";
import type { OAuthIdentity, OAuthResolvedAudience } from "./types";

type PayloadUser = User;

function normalizeEmail(email?: string): string | undefined {
	return email?.trim().toLowerCase();
}

function canAccessAdmin(user: PayloadUser): boolean {
	return user.role === "admin" || user.role === "moderator";
}

function buildSyntheticEmail(identity: OAuthIdentity): string {
	const safeAccountId = identity.providerAccountId.replace(
		/[^a-zA-Z0-9_-]/g,
		"_",
	);
	return `oauth+${identity.provider}-${safeAccountId}@auth.buynsellem.invalid`;
}

function makeRandomPassword(): string {
	return randomBytes(32).toString("hex");
}

function toRelationId(val: unknown): string | null | undefined {
	if (val === undefined) return undefined;
	if (val === null) return null;
	if (typeof val === "string") return val;
	if (typeof val === "object" && "id" in (val as object))
		return (val as { id: string }).id;
	return undefined;
}

function withProviderLink(
	user: PayloadUser,
	identity: OAuthIdentity,
): Pick<PayloadUser, "authProvider" | "authProviders" | "providerAccountId"> {
	const existingLinks = Array.isArray(user.authProviders)
		? user.authProviders
		: [];
	const alreadyLinked = existingLinks.some(
		(link) =>
			link.provider === identity.provider &&
			link.providerAccountId === identity.providerAccountId,
	);

	return {
		authProvider: identity.provider,
		authProviders: alreadyLinked
			? existingLinks
			: [
					...existingLinks,
					{
						provider: identity.provider,
						providerAccountId: identity.providerAccountId,
					},
				],
		providerAccountId: identity.providerAccountId,
	};
}

async function findByProvider(
	payload: Payload,
	identity: OAuthIdentity,
): Promise<null | PayloadUser> {
	const result = await payload.find({
		collection: "users",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		where: {
			or: [
				{
					and: [
						{ authProvider: { equals: identity.provider } },
						{ providerAccountId: { equals: identity.providerAccountId } },
					],
				},
				{
					and: [
						{ "authProviders.provider": { equals: identity.provider } },
						{
							"authProviders.providerAccountId": {
								equals: identity.providerAccountId,
							},
						},
					],
				},
			],
		},
	});

	return (result.docs[0] as PayloadUser | undefined) ?? null;
}

async function findByVerifiedEmail(
	payload: Payload,
	identity: OAuthIdentity,
): Promise<null | PayloadUser> {
	if (!identity.email || !identity.emailVerified) {
		return null;
	}

	const result = await payload.find({
		collection: "users",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		where: {
			email: { equals: normalizeEmail(identity.email) },
		},
	});

	return (result.docs[0] as PayloadUser | undefined) ?? null;
}

export async function resolveOAuthUser(
	payload: Payload,
	identity: OAuthIdentity,
	options: {
		audience: OAuthResolvedAudience;
	},
): Promise<PayloadUser> {
	const linkedUser = await findByProvider(payload, identity);

	if (linkedUser) {
		if (options.audience === "admin" && !canAccessAdmin(linkedUser)) {
			throw new Error("This account is not allowed to access admin");
		}

		const nextData = {
			...withProviderLink(linkedUser, identity),
			...(identity.name ? { name: identity.name } : {}),
			// Explicitly carry avatar as a plain ID so Payload's internal merge
			// cannot inject a populated Media object (which MongoDB rejects as ObjectId).
			// linkedUser was fetched with depth:0 so avatar is already a string,
			// but toRelationId handles both forms defensively.
			avatar: toRelationId(linkedUser.avatar),
		};

		return (await payload.update({
			collection: "users",
			context: { oauthFlow: true },
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			data: nextData as any,
			id: linkedUser.id,
			overrideAccess: true,
		})) as PayloadUser;
	}

	const emailMatchedUser = await findByVerifiedEmail(payload, identity);
	if (emailMatchedUser) {
		if (options.audience === "admin" && !canAccessAdmin(emailMatchedUser)) {
			throw new Error("This account is not allowed to access admin");
		}

		const emailMatchData = {
			...withProviderLink(emailMatchedUser, identity),
			avatar: toRelationId(emailMatchedUser.avatar),
		};

		return (await payload.update({
			collection: "users",
			context: { oauthFlow: true },
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			data: emailMatchData as any,
			id: emailMatchedUser.id,
			overrideAccess: true,
		})) as PayloadUser;
	}

	if (options.audience === "admin") {
		throw new Error(
			"No existing admin account matches this OAuth identity. Create or upgrade the account first, then try again.",
		);
	}

	const email = normalizeEmail(identity.email) ?? buildSyntheticEmail(identity);
	const createData: RequiredDataFromCollectionSlug<"users"> = {
		authProvider: identity.provider,
		authProviders: [
			{
				provider: identity.provider,
				providerAccountId: identity.providerAccountId,
			},
		],
		email,
		name: identity.name?.trim() || email.split("@")[0],
		password: makeRandomPassword(),
		providerAccountId: identity.providerAccountId,
		role: "user",
	};

	return (await payload.create({
		collection: "users",
		context: { oauthFlow: true },
		data: createData,
		overrideAccess: true,
	})) as PayloadUser;
}
