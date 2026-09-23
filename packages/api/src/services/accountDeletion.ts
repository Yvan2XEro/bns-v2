import type { Payload } from "payload";
import { createAppleClientSecretFor } from "@/auth/oauth/providers";
import { ACCOUNT_DELETION_CONTEXT } from "../collections/Listings";
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
		context?: Record<string, unknown>;
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
			// `overrideAccess` skips access control, not hooks: Listings refuses
			// to delete a listing that carries a product unless this says who is
			// asking. Every delete in the cascade carries it, so a collection that
			// grows its own guard later does not have to be found by a failing
			// account deletion in production.
			context: ACCOUNT_DELETION_CONTEXT,
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
 *
 * Without a replicaSet (pre-Task 18) `withTransaction` is a no-op and each
 * write here lands immediately, so a mid-function crash must still leave a
 * re-runnable state: the webhook bodies are rewritten *before* the intents
 * that name them are anonymised, because the retry gate for "which webhook
 * events still need this" is "the intents that still have this customer" —
 * clear the intent first and a re-run can no longer find its own events to
 * redact, and the person's email/phone/name in `raw` would survive forever.
 * `retainedWebhookRaw` is itself idempotent (a body already rewritten is
 * returned as-is), so redacting the same event twice on a retry is safe.
 *
 * What a crash leaves behind, step by step:
 * - before boost-payments: nothing changed, re-run starts clean.
 * - mid boost-payments loop: some rows already lost their `user`; re-run
 *   only finds and finishes the rest (per-row gate).
 * - after boost-payments, before/mid webhook-events: intents still have
 *   `customer`, so a re-run finds the same intents, the same references, and
 *   redacts any body it has not already redacted.
 * - after webhook-events, before/mid payment-intents: bodies are already
 *   safe; a re-run redacts them again as a no-op and finishes anonymising
 *   the remaining intents (per-row gate).
 * - after payment-intents: `customer` is cleared, so a re-run's `find`
 *   returns nothing and the function is a no-op — fully converged.
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
	const keys = (field: "providerReference" | "reference"): string[] =>
		intents
			.map((intent) => intent[field])
			.filter(
				(value): value is string =>
					typeof value === "string" && value.length > 0,
			);
	const references = keys("reference");
	const providerReferences = keys("providerReference");

	// Matched on either key: an event whose body carries no merchant reference
	// (any Stripe event that is not `checkout.session.*`, a NotchPay body
	// without one) is stored under the provider's transaction id alone, and a
	// sweep on `reference` would walk straight past it while it still holds the
	// customer's email, name and phone.
	const matchers = [
		...(references.length > 0 ? [{ reference: { in: references } }] : []),
		...(providerReferences.length > 0
			? [{ providerReference: { in: providerReferences } }]
			: []),
	];

	if (matchers.length > 0) {
		for (const event of await findAllDocs(
			payload,
			"webhook-events",
			{ or: matchers },
			req,
		)) {
			await payload.update({
				collection: "webhook-events",
				id: event.id,
				overrideAccess: true,
				data: {
					// payloadHash is left untouched: it attests to the body the
					// provider actually sent, not to what we still store after
					// this rewrite, and re-verifying it against `raw`
					// post-redaction was never the point — proving the record
					// has not been tampered with since receipt is.
					raw: retainedWebhookRaw(String(event.provider ?? ""), event.raw),
				},
				req,
			});
		}
	}

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
	req?: TxReq,
): Promise<void> {
	const userId = user.id;

	// Dynamic import: `Users.ts` → `accountDeletion.ts` must stay free of the
	// product/shop service graph at config load, and this pulls in both.
	const { closeOwnedShops } = await import("./shopListings");
	await closeOwnedShops(
		payload as unknown as import("payload").Payload,
		userId,
	);

	if (req?.transactionID) {
		// The caller — Users.ts's beforeDelete hook — already opened a
		// transaction for the surrounding delete operation. Starting a second,
		// independent one here would let this cascade commit while the user
		// delete it belongs to fails (or vice versa), and neither session could
		// see the other's uncommitted writes in the meantime. Run inside the
		// same transaction instead of opening our own.
		await runDeletionCascade(payload, userId, req);
	} else {
		// Called standalone (as in tests, or a caller with no ambient
		// transaction): open one so every write here still lands or rolls
		// back together.
		await withTransaction(payload as unknown as Payload, (txReq) =>
			runDeletionCascade(payload, userId, txReq),
		);
	}

	// Outside the transaction: both are network calls to a third party and
	// must not hold a database transaction open while they run. Neither
	// writes a Payload document, so they carry no transactional requirement
	// of their own; each is already best-effort and logs rather than throws.
	await revokeAppleRefreshToken(user, payload);
	await deleteNotificationSubscriber(userId, payload);
}
