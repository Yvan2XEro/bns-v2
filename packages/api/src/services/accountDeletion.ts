import { createAppleClientSecret } from "@/auth/oauth/providers";
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
		docs: Array<{ id: string }>;
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

	if (!appleLink?.refreshToken || !process.env.APPLE_OAUTH_CLIENT_ID) {
		return;
	}

	try {
		const clientSecret = await createAppleClientSecret();
		const response = await fetch("https://appleid.apple.com/auth/revoke", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				client_id: process.env.APPLE_OAUTH_CLIENT_ID,
				client_secret: clientSecret,
				token: appleLink.refreshToken,
				token_type_hint: "refresh_token",
			}),
		});

		if (!response.ok) {
			const detail = await response.text().catch(() => "");
			payload.logger.warn("[account-deletion] Failed to revoke Apple token", {
				detail,
				status: response.status,
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

	await deleteByIds(payload, "messages", messageIds);
	await deleteByIds(payload, "conversations", conversationIds);
	await deleteByIds(payload, "listings", listingIds);

	await revokeAppleRefreshToken(user, payload);
	await deleteNotificationSubscriber(userId, payload);
}
