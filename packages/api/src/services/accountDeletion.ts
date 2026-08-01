import { createAppleClientSecretFor } from "@/auth/oauth/providers";
import {
	getNotificationProvider,
	isNotificationProviderConfigured,
} from "./notificationProvider";

type AuthProviderLink = {
	provider?: string;
	providerAccountId?: string;
	refreshToken?: string;
};

type UserWithAuthProviders = {
	authProviders?: AuthProviderLink[] | null;
	id: string;
};

type PayloadLike = {
	delete: (options: {
		collection: string;
		id: string;
		overrideAccess?: boolean;
	}) => Promise<unknown>;
	find: (options: {
		collection: string;
		depth?: number;
		limit?: number;
		overrideAccess?: boolean;
		page?: number;
		where: Record<string, unknown>;
	}) => Promise<{
		docs: Array<Record<string, unknown> & { id: string }>;
		hasNextPage?: boolean;
		nextPage?: null | number;
	}>;
	logger: {
		error: (message: string, meta?: Record<string, unknown>) => void;
		warn: (message: string, meta?: Record<string, unknown>) => void;
	};
};

async function findAllIds(
	payload: PayloadLike,
	collection: string,
	where: Record<string, unknown>,
): Promise<string[]> {
	const ids: string[] = [];
	let page = 1;
	let hasNextPage = true;

	while (hasNextPage) {
		const result = await payload.find({
			collection,
			depth: 0,
			limit: 100,
			overrideAccess: true,
			page,
			where,
		});

		ids.push(...result.docs.map((doc) => doc.id));
		hasNextPage = Boolean(result.hasNextPage);
		page = result.nextPage ?? page + 1;
	}

	return ids;
}

function toRelationId(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (value && typeof value === "object" && "id" in value) {
		const { id } = value as { id?: unknown };
		if (typeof id === "string") return id;
	}
	return undefined;
}

/**
 * Uploads are not covered by the relational cascade: media documents carry no
 * back-reference to their owner, so deleting listings and the user leaves every
 * listing photo and the avatar on disk and publicly fetchable by URL. Apple
 * (5.1.1(v)) and the Play data-deletion declaration both require them gone.
 */
async function findOwnedMediaIds(
	payload: PayloadLike,
	userId: string,
	listingIds: string[],
): Promise<string[]> {
	const mediaIds = new Set<string>();

	const userResult = await payload.find({
		collection: "users",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		where: { id: { equals: userId } },
	});
	for (const doc of userResult.docs) {
		const avatarId = toRelationId(doc.avatar);
		if (avatarId) mediaIds.add(avatarId);
	}

	// Guard the empty case explicitly: `{ id: { in: [] } }` is not reliably an
	// empty match across adapters, and a match-all here would collect (and then
	// delete) every media document in the database.
	if (listingIds.length === 0) return [...mediaIds];

	let page = 1;
	let hasNextPage = true;

	while (hasNextPage) {
		const result = await payload.find({
			collection: "listings",
			depth: 0,
			limit: 100,
			overrideAccess: true,
			page,
			where: { id: { in: listingIds } },
		});

		for (const doc of result.docs) {
			const images = Array.isArray(doc.images) ? doc.images : [];
			for (const entry of images) {
				const imageId = toRelationId(
					entry && typeof entry === "object"
						? (entry as { image?: unknown }).image
						: undefined,
				);
				if (imageId) mediaIds.add(imageId);
			}
		}

		hasNextPage = Boolean(result.hasNextPage);
		page = result.nextPage ?? page + 1;
	}

	return [...mediaIds];
}

async function deleteByIds(
	payload: PayloadLike,
	collection: string,
	ids: string[],
): Promise<void> {
	for (const id of ids) {
		await payload.delete({
			collection,
			id,
			overrideAccess: true,
		});
	}
}

async function revokeAppleRefreshToken(
	user: UserWithAuthProviders,
	payload: PayloadLike,
): Promise<void> {
	const appleLink = user.authProviders?.find(
		(link) => link.provider === "apple" && link.refreshToken,
	);

	// A refresh token is bound to the client that obtained it: the Services ID
	// for the web flow, the bundle id for native Sign in with Apple. We do not
	// record which one issued it, so try each configured client and stop at the
	// first success.
	const clientIds = [
		process.env.APPLE_NATIVE_CLIENT_ID,
		process.env.APPLE_OAUTH_CLIENT_ID,
	].filter((value): value is string => Boolean(value));

	if (!appleLink?.refreshToken || clientIds.length === 0) {
		return;
	}

	try {
		let revoked = false;
		let lastStatus: number | undefined;
		let lastDetail = "";

		for (const clientId of clientIds) {
			const clientSecret = await createAppleClientSecretFor(clientId);
			const response = await fetch("https://appleid.apple.com/auth/revoke", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					client_id: clientId,
					client_secret: clientSecret,
					token: appleLink.refreshToken,
					token_type_hint: "refresh_token",
				}),
			});

			if (response.ok) {
				revoked = true;
				break;
			}

			lastStatus = response.status;
			lastDetail = await response.text().catch(() => "");
		}

		if (!revoked) {
			payload.logger.warn("[account-deletion] Failed to revoke Apple token", {
				detail: lastDetail,
				status: lastStatus,
				userId: user.id,
			});
		}
	} catch (error) {
		payload.logger.warn("[account-deletion] Apple token revocation failed", {
			error: error instanceof Error ? error.message : String(error),
			userId: user.id,
		});
	}
}

async function deleteNotificationSubscriber(
	userId: string,
	payload: PayloadLike,
): Promise<void> {
	if (!isNotificationProviderConfigured()) {
		return;
	}

	try {
		const notificationProvider = getNotificationProvider();
		await notificationProvider.subscribers.delete(userId);
	} catch (error) {
		payload.logger.warn(
			"[account-deletion] Failed to delete notification subscriber",
			{
				error: error instanceof Error ? error.message : String(error),
				userId,
			},
		);
	}
}

export async function deleteUserRelatedData(
	payload: PayloadLike,
	user: UserWithAuthProviders,
): Promise<void> {
	const userId = user.id;

	const listingIds = await findAllIds(payload, "listings", {
		seller: { equals: userId },
	});
	const conversationIds = await findAllIds(payload, "conversations", {
		participants: { equals: userId },
	});
	const messageIds = await findAllIds(payload, "messages", {
		or: [
			{ sender: { equals: userId } },
			...(conversationIds.length > 0
				? [{ conversation: { in: conversationIds } }]
				: []),
		],
	});

	await deleteByIds(
		payload,
		"favorites",
		await findAllIds(payload, "favorites", {
			or: [
				{ user: { equals: userId } },
				...(listingIds.length > 0 ? [{ listing: { in: listingIds } }] : []),
			],
		}),
	);

	await deleteByIds(
		payload,
		"saved-searches",
		await findAllIds(payload, "saved-searches", {
			user: { equals: userId },
		}),
	);

	await deleteByIds(
		payload,
		"boost-payments",
		await findAllIds(payload, "boost-payments", {
			or: [
				{ user: { equals: userId } },
				...(listingIds.length > 0 ? [{ listing: { in: listingIds } }] : []),
			],
		}),
	);

	await deleteByIds(
		payload,
		"blocked-users",
		await findAllIds(payload, "blocked-users", {
			or: [{ blocker: { equals: userId } }, { blocked: { equals: userId } }],
		}),
	);

	await deleteByIds(
		payload,
		"reports",
		await findAllIds(payload, "reports", {
			or: [
				{ reporter: { equals: userId } },
				{ resolvedBy: { equals: userId } },
				{
					and: [
						{ targetType: { equals: "user" } },
						{ targetId: { equals: userId } },
					],
				},
				...(listingIds.length > 0
					? [
							{
								and: [
									{ targetType: { equals: "listing" } },
									{ targetId: { in: listingIds } },
								],
							},
						]
					: []),
				...(messageIds.length > 0
					? [
							{
								and: [
									{ targetType: { equals: "message" } },
									{ targetId: { in: messageIds } },
								],
							},
						]
					: []),
			],
		}),
	);

	await deleteByIds(
		payload,
		"reviews",
		await findAllIds(payload, "reviews", {
			or: [
				{ reviewer: { equals: userId } },
				{ reviewedUser: { equals: userId } },
			],
		}),
	);

	// Resolved before the listings go away — the image references live on them.
	const mediaIds = await findOwnedMediaIds(payload, userId, listingIds);

	await deleteByIds(payload, "messages", messageIds);
	await deleteByIds(payload, "conversations", conversationIds);
	await deleteByIds(payload, "listings", listingIds);
	await deleteByIds(payload, "media", mediaIds);

	await revokeAppleRefreshToken(user, payload);
	await deleteNotificationSubscriber(userId, payload);
}
