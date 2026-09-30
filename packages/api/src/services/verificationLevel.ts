import type { PayloadRequest } from "payload";
import { relationId } from "../lib/relationId";
import type { VerificationRequest } from "../payload-types";
import {
	type LevelCause,
	notifyShopLevelChanged,
	type ShopLevelChange,
	setShopLevel,
} from "./shops";

function backing(
	requests: VerificationRequest[],
	level: 2 | 3,
	ownerId: string,
	now: Date,
): VerificationRequest | null {
	return (
		requests.find(
			(request) =>
				request.requestedLevel === level &&
				request.status === "approved" &&
				relationId(request.submittedBy) === ownerId &&
				Boolean(request.expiresAt) &&
				Date.parse(String(request.expiresAt)) > now.getTime(),
		) ?? null
	);
}

/**
 * Recomputes the shop's level from the requests that currently back it, and
 * writes it through `setShopLevel`. Runs inside every transition that can
 * change a level, so the stored level is never a guess about what some job
 * will do next.
 *
 * Suspension is deliberately not consulted: a suspended shop keeps its stored
 * level and `shopCapabilities` reports nothing for it, so lifting the
 * suspension restores exactly what was proved, with no re-verification.
 */
export async function recomputeShopLevel(
	req: PayloadRequest,
	shopId: string,
	cause: LevelCause,
	now = new Date(),
): Promise<ShopLevelChange | null> {
	const shop = await req.payload.findByID({
		collection: "shops",
		id: shopId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const ownerId = relationId(shop.owner) ?? "";
	const previousLevel = Number(shop.level ?? 1);

	const found = await req.payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
		where: {
			and: [{ shop: { equals: shopId } }, { status: { equals: "approved" } }],
		},
	});
	const requests = found.docs as VerificationRequest[];

	const level2 = backing(requests, 2, ownerId, now);
	const level3 = level2 ? backing(requests, 3, ownerId, now) : null;
	const level: 1 | 2 | 3 = level3 ? 3 : level2 ? 2 : 1;

	const expiries = [level2, level3]
		.filter((request): request is VerificationRequest => request !== null)
		.map((request) => Date.parse(String(request.expiresAt)));
	const levelExpiresAt = expiries.length
		? new Date(Math.min(...expiries)).toISOString()
		: null;

	await setShopLevel(req, shopId, {
		level,
		levelExpiresAt,
		verifiedAt: level >= 2 && !shop.verifiedAt ? now.toISOString() : null,
	});

	if (level === previousLevel) return null;

	const change: ShopLevelChange = { shopId, previousLevel, level, cause };
	await notifyShopLevelChanged(req, change);
	return change;
}
