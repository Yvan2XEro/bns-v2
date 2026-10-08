import { createHmac } from "node:crypto";
import type { Payload } from "payload";
import {
	type CounterStore,
	getCounterStore,
	hitCounter,
} from "../lib/rateLimit";
import { relationId } from "../lib/relationId";

const VIEW_TTL_SECONDS = 8 * 24 * 60 * 60;
const DEDUPE_TTL_SECONDS = 30 * 60;
const VIEW_LIMIT = { limit: 120, windowSeconds: 3600 };

export interface CountListingViewInput {
	listingId: string;
	viewerId: string | null;
	installId: string | null;
	ip: string;
	userAgent: string;
	now?: Date;
}

function keyedHash(value: string): string {
	const secret = process.env.RISK_HASH_SECRET ?? process.env.PAYLOAD_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error("A 32-character server secret is required for view keys.");
	}
	return createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
}

function doualaDate(date: Date): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Africa/Douala",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const values = Object.fromEntries(
		parts.map(({ type, value }) => [type, value]),
	);
	return `${values.year}-${values.month}-${values.day}`;
}

async function isShopMember(
	payload: Payload,
	shopId: string | null,
	userId: string,
): Promise<boolean> {
	if (!shopId) return false;
	const result = await payload.find({
		collection: "shop-members",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ user: { equals: userId } },
				{ status: { equals: "active" } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	return result.docs.length > 0;
}

export async function countListingView(
	payload: Payload,
	input: CountListingViewInput,
	deps: { store?: CounterStore } = {},
): Promise<{ counted: boolean }> {
	const listing = await payload
		.findByID({
			collection: "listings",
			id: input.listingId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!listing || listing.status !== "published") return { counted: false };

	const sellerId = relationId(listing.seller);
	const shopId = relationId(listing.shop);
	if (
		input.viewerId &&
		(input.viewerId === sellerId ||
			(await isShopMember(payload, shopId, input.viewerId)))
	) {
		return { counted: false };
	}

	const viewerKey = input.viewerId
		? `user:${input.viewerId}`
		: input.installId
			? `install:${keyedHash(input.installId)}`
			: `network:${keyedHash(`${input.ip}\n${input.userAgent}`)}`;
	const now = input.now ?? new Date();
	const store = deps.store ?? getCounterStore();
	const hourBucket = Math.floor(
		now.getTime() / (VIEW_LIMIT.windowSeconds * 1000),
	);
	const rate = await hitCounter(
		store,
		`listing-views:${viewerKey}:${hourBucket}`,
		VIEW_LIMIT,
		now.getTime(),
	);
	if (!rate.allowed) return { counted: false };

	if (!store.setIfAbsent || !store.incrementHash) {
		throw new Error("The counter store does not support listing views.");
	}
	const dedupeKey = `view:dedupe:${listing.id}:${viewerKey}`;
	const reserved = await store.setIfAbsent(dedupeKey, "1", DEDUPE_TTL_SECONDS);
	if (!reserved) return { counted: false };
	const date = doualaDate(now);
	await store.incrementHash(
		`stats:views:${date.replaceAll("-", "")}`,
		String(listing.id),
		VIEW_TTL_SECONDS,
	);
	return { counted: true };
}
