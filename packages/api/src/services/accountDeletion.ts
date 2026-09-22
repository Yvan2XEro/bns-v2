import type { Payload } from "payload";
import { createAppleClientSecretFor } from "@/auth/oauth/providers";
import { anonymizeIdentifier, retainedWebhookRaw } from "../lib/redact";
import { type TxReq, withTransaction } from "../lib/transactions";
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
		req?: TxReq;
	}) => Promise<unknown>;
	find: (options: {
		collection: string;
		depth?: number;
		limit?: number;
		overrideAccess?: boolean;
		page?: number;
		where: Record<string, unknown>;
		req?: TxReq;
	}) => Promise<{
		docs: Array<Record<string, unknown> & { id: string }>;
		hasNextPage?: boolean;
		nextPage?: null | number;
	}>;
	logger: {
		error: (message: string, meta?: Record<string, unknown>) => void;
		warn: (message: string, meta?: Record<string, unknown>) => void;
	};
	update: (options: {
		collection: string;
		id: string;
		data: Record<string, unknown>;
		overrideAccess?: boolean;
		req?: TxReq;
	}) => Promise<unknown>;
};

async function findAllDocs(
	payload: PayloadLike,
	collection: string,
	where: Record<string, unknown>,
	req?: TxReq,
): Promise<Array<Record<string, unknown> & { id: string }>> {
	const docs: Array<Record<string, unknown> & { id: string }> = [];
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
			req,
		});
		docs.push(...result.docs);
		hasNextPage = Boolean(result.hasNextPage);
		page = result.nextPage ?? page + 1;
	}

	return docs;
}

async function findAllIds(
	payload: PayloadLike,
	collection: string,
	where: Record<string, unknown>,
	req?: TxReq,
): Promise<string[]> {
	return (await findAllDocs(payload, collection, where, req)).map(
		(doc) => doc.id,
	);
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
	req?: TxReq,
): Promise<string[]> {
	const mediaIds = new Set<string>();

	const userResult = await payload.find({
		collection: "users",
		depth: 0,
		limit: 1,
		overrideAccess: true,
		where: { id: { equals: userId } },
		req,
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
			req,
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
	req?: TxReq,
): Promise<void> {
	for (const id of ids) {
		await payload.delete({
			collection,
			id,
			overrideAccess: true,
			req,
		});
	}
}

/**
 * The idempotency key is `boost:${userId}:…` (services/boostPurchase.ts):
 * unique and required, and the one place besides `customer` that names the
 * person on a kept payment intent. The user segment is swapped for its
 * one-way anonymised form so the key stays unique and stable across retries
 * without naming anyone.
 */
function anonymizeIdempotencyKey(key: unknown, userId: string): unknown {
	if (typeof key !== "string" || !key.includes(userId)) return key;
	return key.split(userId).join(anonymizeIdentifier(userId));
}

/**
 * Payment records are transaction data the law requires us to keep (Law
 * 2010/021 art. 32): they lose the customer, never the amounts or references.
 * Ids are collected before any update, so paging never skips a record.
 */
async function retainPaymentRecords(
	payload: PayloadLike,
	userId: string,
	req?: TxReq,
): Promise<void> {
	const customerDeletedAt = new Date().toISOString();

	for (const id of await findAllIds(
		payload,
		"boost-payments",
		{ user: { equals: userId } },
		req,
	)) {
		await payload.update({
			collection: "boost-payments",
			id,
			overrideAccess: true,
			data: { user: null, customerDeletedAt },
			req,
		});
	}

	const intents = await findAllDocs(
		payload,
		"payment-intents",
		{ customer: { equals: userId } },
		req,
	);
	const references = intents
		.map((intent) => intent.reference)
		.filter(
			(reference): reference is string =>
				typeof reference === "string" && reference.length > 0,
		);

	for (const intent of intents) {
		await payload.update({
			collection: "payment-intents",
			id: intent.id,
			overrideAccess: true,
			data: {
				customer: null,
				customerDeletedAt,
				idempotencyKey: anonymizeIdempotencyKey(intent.idempotencyKey, userId),
			},
			req,
		});
	}

	if (references.length === 0) return;
	for (const event of await findAllDocs(
		payload,
		"webhook-events",
		{ reference: { in: references } },
		req,
	)) {
		await payload.update({
			collection: "webhook-events",
			id: event.id,
			overrideAccess: true,
			data: {
				// payloadHash is left untouched: it attests to the body the
				// provider actually sent, not to what we still store after this
				// rewrite, and re-verifying it against `raw` post-redaction was
				// never the point — proving the record has not been tampered
				// with since receipt is.
				raw: retainedWebhookRaw(String(event.provider ?? ""), event.raw),
			},
			req,
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

/**
 * Every document that changes together lives in one transaction, the way
 * boostPurchase.ts wraps its multi-document writes: a crash partway through
 * must never leave the account half-anonymised (customer nulled on one
 * collection but not another). Each step is re-derived from a fresh `find`
 * gated on fields the previous run would have already cleared (`customer`,
 * `user`), so a retry after a rollback converges on the same end state
 * instead of double-processing or skipping documents.
 */
async function runDeletionCascade(
	payload: PayloadLike,
	userId: string,
	req: TxReq,
): Promise<void> {
	const listingIds = await findAllIds(
		payload,
		"listings",
		{ seller: { equals: userId } },
		req,
	);
	const conversationIds = await findAllIds(
		payload,
		"conversations",
		{ participants: { equals: userId } },
		req,
	);
	const messageIds = await findAllIds(
		payload,
		"messages",
		{
			or: [
				{ sender: { equals: userId } },
				...(conversationIds.length > 0
					? [{ conversation: { in: conversationIds } }]
					: []),
			],
		},
		req,
	);

	await deleteByIds(
		payload,
		"favorites",
		await findAllIds(
			payload,
			"favorites",
			{
				or: [
					{ user: { equals: userId } },
					...(listingIds.length > 0 ? [{ listing: { in: listingIds } }] : []),
				],
			},
			req,
		),
		req,
	);

	await deleteByIds(
		payload,
		"saved-searches",
		await findAllIds(
			payload,
			"saved-searches",
			{ user: { equals: userId } },
			req,
		),
		req,
	);

	await retainPaymentRecords(payload, userId, req);

	await deleteByIds(
		payload,
		"contact-reveals",
		await findAllIds(
			payload,
			"contact-reveals",
			{ or: [{ viewer: { equals: userId } }, { seller: { equals: userId } }] },
			req,
		),
		req,
	);

	await deleteByIds(
		payload,
		"blocked-users",
		await findAllIds(
			payload,
			"blocked-users",
			{
				or: [{ blocker: { equals: userId } }, { blocked: { equals: userId } }],
			},
			req,
		),
		req,
	);

	await deleteByIds(
		payload,
		"reports",
		await findAllIds(
			payload,
			"reports",
			{
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
			},
			req,
		),
		req,
	);

	await deleteByIds(
		payload,
		"reviews",
		await findAllIds(
			payload,
			"reviews",
			{
				or: [
					{ reviewer: { equals: userId } },
					{ reviewedUser: { equals: userId } },
				],
			},
			req,
		),
		req,
	);

	// Resolved before the listings go away — the image references live on them.
	const mediaIds = await findOwnedMediaIds(payload, userId, listingIds, req);

	await deleteByIds(payload, "messages", messageIds, req);
	await deleteByIds(payload, "conversations", conversationIds, req);
	await deleteByIds(payload, "listings", listingIds, req);
	await deleteByIds(payload, "media", mediaIds, req);
}

export async function deleteUserRelatedData(
	payload: PayloadLike,
	user: UserWithAuthProviders,
): Promise<void> {
	const userId = user.id;

	await withTransaction(payload as unknown as Payload, (req) =>
		runDeletionCascade(payload, userId, req),
	);

	// Outside the transaction: both are network calls to a third party and
	// must not hold a database transaction open while they run. Neither
	// writes a Payload document, so they carry no transactional requirement
	// of their own; each is already best-effort and logs rather than throws.
	await revokeAppleRefreshToken(user, payload);
	await deleteNotificationSubscriber(userId, payload);
}
