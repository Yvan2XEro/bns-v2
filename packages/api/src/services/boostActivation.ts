import type { Payload } from "payload";
import { relationId } from "../lib/relationId";
import type { TxReq } from "../lib/transactions";

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
	if (boost.status === "completed")
		return { activated: false, boostedUntil: null };

	const listingId = relationId(boost.listing);
	if (!listingId)
		throw new Error(`Boost payment ${boostPaymentId} has no listing`);

	const listing = await payload.findByID({
		collection: "listings",
		id: listingId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const days = Number.parseInt(String(boost.duration), 10);
	const boostedUntil = computeBoostedUntil(listing.boostedUntil, now, days);

	await payload.update({
		collection: "listings",
		id: listingId,
		data: { boostedUntil },
		depth: 0,
		overrideAccess: true,
		req,
	});
	await payload.update({
		collection: "boost-payments",
		id: boostPaymentId,
		data: { status: "completed" },
		depth: 0,
		overrideAccess: true,
		req,
	});
	return { activated: true, boostedUntil };
}

/** Only a pending purchase can fail; a completed one is never downgraded. */
export async function failBoostPayment(
	payload: Payload,
	boostPaymentId: string,
	req?: TxReq,
): Promise<void> {
	const boost = await payload.findByID({
		collection: "boost-payments",
		id: boostPaymentId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (boost.status !== "pending") return;
	await payload.update({
		collection: "boost-payments",
		id: boostPaymentId,
		data: { status: "failed" },
		depth: 0,
		overrideAccess: true,
		req,
	});
}
