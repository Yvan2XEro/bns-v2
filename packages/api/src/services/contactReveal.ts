import type { Payload } from "payload";
import { suspensionSummary } from "../access/roles";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import {
	type CounterStore,
	getCounterStore,
	hitRateLimit,
	type RateLimitWindow,
} from "../lib/rateLimit";
import { relationId } from "../lib/relationId";

export const CONTACT_PHONE_LIMITS: readonly RateLimitWindow[] = [
	{ name: "contact-phone:hour", limit: 20, windowSeconds: 3600 },
	{ name: "contact-phone:day", limit: 60, windowSeconds: 86400 },
];

const REVEAL_DEDUP_MS = 24 * 60 * 60 * 1000;

export class ContactRevealError extends Error {
	code: ErrorCode;
	status: number;

	constructor(code: ErrorCode, status: number) {
		super(code);
		this.name = "ContactRevealError";
		this.code = code;
		this.status = status;
	}
}

export async function revealContactPhone(
	payload: Payload,
	input: { listingId: string; viewerId: string; now?: Date },
	deps: { store?: CounterStore } = {},
): Promise<{ phone: string }> {
	const now = input.now ?? new Date();

	// Counted before any lookup: failed calls are enumeration attempts too.
	if (
		await hitRateLimit(
			deps.store ?? getCounterStore(),
			input.viewerId,
			CONTACT_PHONE_LIMITS,
			now.getTime(),
		)
	) {
		throw new ContactRevealError(ERROR_CODES.rateLimited, 429);
	}

	const listing = await payload
		.findByID({
			collection: "listings",
			id: input.listingId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!listing || listing.status !== "published") {
		throw new ContactRevealError(ERROR_CODES.listingNotFound, 404);
	}

	const sellerId = relationId(listing.seller);
	const seller = sellerId
		? await payload
				.findByID({
					collection: "users",
					id: sellerId,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null)
		: null;
	const phone = typeof seller?.phone === "string" ? seller.phone.trim() : "";
	if (!seller || !sellerId || !phone || suspensionSummary(seller, now).active) {
		throw new ContactRevealError(ERROR_CODES.contactPhoneUnavailable, 404);
	}

	if (sellerId !== input.viewerId) {
		const recent = await payload.find({
			collection: "contact-reveals",
			where: {
				and: [
					{ viewer: { equals: input.viewerId } },
					{ listing: { equals: String(listing.id) } },
					{
						createdAt: {
							greater_than: new Date(
								now.getTime() - REVEAL_DEDUP_MS,
							).toISOString(),
						},
					},
				],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		if (recent.docs.length === 0) {
			await payload.create({
				collection: "contact-reveals",
				depth: 0,
				overrideAccess: true,
				data: {
					listing: String(listing.id),
					seller: sellerId,
					viewer: input.viewerId,
				},
			});
		}
	}

	return { phone };
}
