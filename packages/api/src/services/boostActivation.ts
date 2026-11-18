import type { Payload } from "payload";
import { relationId } from "../lib/relationId";
import type { TxReq } from "../lib/transactions";
import type { BoostPayment } from "../payload-types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A second purchase extends a running boost instead of resetting it. */
export function computeBoostedUntil(
	current: string | null | undefined,
	now: Date,
	days: number,
): string {
	const currentTime = current ? new Date(current).getTime() : Number.NaN;
	const base =
		Number.isFinite(currentTime) && currentTime > now.getTime()
			? currentTime
			: now.getTime();
	return new Date(base + days * DAY_MS).toISOString();
}

/** The window a purchase reserved, if a previous activation got that far. */
function reservedWindow(boost: BoostPayment): string | null {
	return typeof boost.boostedUntil === "string" && boost.boostedUntil
		? boost.boostedUntil
		: null;
}

/**
 * Fixes the end of the window this purchase pays for, once. Every later replay
 * reads the same value back, so extending the listing again converges instead
 * of stacking a second window on top of the first.
 */
async function reserveWindow(
	payload: Payload,
	boost: BoostPayment,
	listingId: string,
	now: Date,
	req?: TxReq,
): Promise<string> {
	const already = reservedWindow(boost);
	if (already) return already;

	const listing = await payload.findByID({
		collection: "listings",
		id: listingId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const days = Number.parseInt(String(boost.duration), 10);
	const candidate = computeBoostedUntil(listing.boostedUntil, now, days);

	const reserved = await payload.db.updateOne({
		collection: "boost-payments",
		where: {
			and: [{ id: { equals: boost.id } }, { boostedUntil: { exists: false } }],
		},
		data: { boostedUntil: candidate },
		req,
	});
	if (reserved) return candidate;

	// Another activation reserved first; its window is the one that counts.
	const current = await payload.findByID({
		collection: "boost-payments",
		id: boost.id,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return reservedWindow(current) ?? candidate;
}

/**
 * Applies a paid boost exactly once, and heals a run interrupted between its
 * writes: the window is reserved first, extending the listing is idempotent,
 * and the purchase is completed last, so a replay finishes what a crash left.
 */
export async function activateBoostPayment(
	payload: Payload,
	boostPaymentId: string,
	req?: TxReq,
	now: Date = new Date(),
): Promise<{ activated: boolean; boostedUntil: string | null }> {
	const boost = await payload.findByID({
		collection: "boost-payments",
		id: boostPaymentId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	// A purchase completed before this service reserved windows (legacy rows)
	// has already been applied; replaying it must not open a second one.
	if (boost.status === "completed" && !reservedWindow(boost))
		return { activated: false, boostedUntil: null };

	const listingId = relationId(boost.listing);
	if (!listingId)
		throw new Error(`Boost payment ${boostPaymentId} has no listing`);

	const boostedUntil = await reserveWindow(payload, boost, listingId, now, req);

	// The collection API, so the listing's afterChange hooks still reindex it.
	// It needs no atomicity: the value is absolute and reserved, and the filter
	// only ever moves the end of the window forward.
	await payload.update({
		collection: "listings",
		where: {
			and: [
				{ id: { equals: listingId } },
				{
					or: [
						{ boostedUntil: { exists: false } },
						{ boostedUntil: { less_than: boostedUntil } },
					],
				},
			],
		},
		data: { boostedUntil },
		depth: 0,
		overrideAccess: true,
		req,
	});

	// Completing last, and conditionally, is what makes the effect exactly once:
	// a crash before this leaves the purchase to the next replay, and only one
	// of two racing activations reports that it did the work.
	const completed = await payload.db.updateOne({
		collection: "boost-payments",
		where: {
			and: [
				{ id: { equals: boostPaymentId } },
				{ status: { not_equals: "completed" } },
			],
		},
		data: { status: "completed" },
		req,
	});
	return { activated: completed !== null, boostedUntil };
}

/** Only a pending purchase can fail; a completed one is never downgraded. */
export async function failBoostPayment(
	payload: Payload,
	boostPaymentId: string,
	req?: TxReq,
): Promise<void> {
	const failed = await payload.db.updateOne({
		collection: "boost-payments",
		where: {
			and: [
				{ id: { equals: boostPaymentId } },
				{ status: { equals: "pending" } },
			],
		},
		data: { status: "failed" },
		req,
	});
	if (failed) return;
	// Nothing was written: either the purchase left `pending`, which is fine, or
	// the id is unknown, which the caller has to hear about.
	await payload.findByID({
		collection: "boost-payments",
		id: boostPaymentId,
		depth: 0,
		overrideAccess: true,
		req,
	});
}
