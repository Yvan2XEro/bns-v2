import type { Payload, PayloadRequest } from "payload";
import { computeTier, countRefusals, worseTier } from "../../lib/buyerRisk";
import type { BuyerTierKey } from "../../lib/orderSettings";
import { hashDeliveryPhone, requirePhonePepper } from "../../lib/phoneHash";
import type { BuyerPhoneScore, Order } from "../../payload-types";
import { normalizePhoneNumber } from "../phoneVerification";

type Doc = Record<string, unknown>;

type BlockedOverride = NonNullable<BuyerPhoneScore["blockedOverride"]>;

type RefusalReason = NonNullable<
	NonNullable<BuyerPhoneScore["refusals"]>[number]["reason"]
>;

type RefusalEntry = {
	order: string | null;
	reason: RefusalReason | null;
	at: string | null;
};

type ScoreRow = {
	phoneHash: string;
	ordersPlaced: number;
	ordersDelivered: number;
	refusals: RefusalEntry[];
	cancelledAfterAccept: number;
	blockedOverride: BlockedOverride;
};

/** `refusals[].order` is a relationship: a plain id with `depth: 0` (every
 * read here uses it), but still typed as `string | Order | null` because the
 * field could in principle be populated. */
function orderIdOf(value: string | Order | null | undefined): string | null {
	if (value == null) return null;
	return typeof value === "string" ? value : value.id;
}

/** The refusals array is pruned to this many rows on every write (Task 10 brief). */
const MAX_REFUSALS_KEPT = 20;

type ScoredRefusalReason = "refused" | "unreachable" | "absent";

/** The only three reasons a delivery failure is the buyer's fault; everything
 * else (`timeout`, `address_not_found`, `other`) carries weight 0 in
 * `refusalWeight` and is never written to the row at all. */
function isScoredRefusal(reason: string): reason is ScoredRefusalReason {
	return (
		reason === "refused" || reason === "unreachable" || reason === "absent"
	);
}

/**
 * `normalizePhoneNumber` requires a leading "+": it was built for a number a
 * user already typed into an OTP form. A delivery phone can arrive as a bare
 * national number or with the "00" international dialling prefix instead, so
 * this adapts those two shapes before handing off to the one real normaliser
 * — it never re-implements its digit stripping or its validation.
 */
function withInternationalPrefix(input: string): string {
	const trimmed = input.trim();
	if (trimmed.startsWith("00")) return `+${trimmed.slice(2)}`;
	if (trimmed.startsWith("+")) return trimmed;
	return `+${trimmed}`;
}

function hashPhone(raw: string): string {
	const e164 = normalizePhoneNumber(withInternationalPrefix(raw));
	return hashDeliveryPhone(
		requirePhonePepper({ ORDER_PHONE_PEPPER: process.env.ORDER_PHONE_PEPPER }),
		e164,
	);
}

function toRow(doc: BuyerPhoneScore | undefined): ScoreRow | null {
	if (!doc) return null;
	return {
		phoneHash: doc.phoneHash,
		ordersPlaced: doc.ordersPlaced ?? 0,
		ordersDelivered: doc.ordersDelivered ?? 0,
		refusals: (doc.refusals ?? []).map((r) => ({
			order: orderIdOf(r.order),
			reason: r.reason ?? null,
			at: r.at ?? null,
		})),
		cancelledAfterAccept: doc.cancelledAfterAccept ?? 0,
		blockedOverride: doc.blockedOverride ?? "none",
	};
}

/**
 * Fails closed, same direction as `computeTier` itself (Task 4): no row for
 * this phone means no history, and no history is `new`, never `trusted`.
 */
async function readRow(
	payload: Payload,
	phoneHash: string,
): Promise<ScoreRow | null> {
	const { docs } = await payload.find({
		collection: "buyer-phone-scores",
		where: { phoneHash: { equals: phoneHash } },
		limit: 1,
		depth: 0,
		pagination: false,
		overrideAccess: true,
	});
	return toRow(docs[0]);
}

/** Narrows the stored, partly-optional rows to what `countRefusals` needs,
 * dropping any entry a direct write left malformed rather than guessing. */
function toCounted(refusals: RefusalEntry[]): { reason: string; at: string }[] {
	return refusals.flatMap((r) =>
		r.reason && r.at ? [{ reason: r.reason, at: r.at }] : [],
	);
}

function tierOf(row: ScoreRow | null, now: Date): BuyerTierKey {
	if (!row) return computeTier({ refusals: 0, delivered: 0 });
	return computeTier({
		refusals: countRefusals(toCounted(row.refusals), now),
		delivered: row.ordersDelivered,
		override: row.blockedOverride,
	});
}

/**
 * One `(order, reason)` pair never counts twice, even if a retried handover
 * replays the same failure — the array itself is the idempotency ledger, so
 * no separate "already counted" field is needed.
 */
function alreadyCounted(
	row: ScoreRow | null,
	orderId: string,
	reason: string,
): boolean {
	if (!row) return false;
	return row.refusals.some((r) => r.order === orderId && r.reason === reason);
}

type CounterField = "ordersPlaced" | "ordersDelivered" | "cancelledAfterAccept";

type ScoreChange = {
	counters?: Partial<Record<CounterField, number>>;
	refusals?: RefusalEntry[];
	tier: BuyerTierKey;
};

/**
 * Upsert-by-`phoneHash`, the same shape as `services/sequences.ts`'s `bump`:
 * a concurrent first writer wins the unique index, and we retry the read so
 * the second writer's increment lands on the row that now exists. Counters
 * go through `$inc` on an existing row (atomic against a concurrent writer)
 * but as plain initial values on `create` — `$inc` is a Mongo update
 * operator, not something `create` understands, so a fresh row would
 * otherwise store the literal `{ $inc: 1 }` instead of `1`.
 */
async function writeRow(
	req: PayloadRequest,
	phoneHash: string,
	current: ScoreRow | null,
	change: ScoreChange,
): Promise<void> {
	if (!current) {
		try {
			await req.payload.create({
				collection: "buyer-phone-scores",
				data: {
					phoneHash,
					ordersPlaced: change.counters?.ordersPlaced ?? 0,
					ordersDelivered: change.counters?.ordersDelivered ?? 0,
					cancelledAfterAccept: change.counters?.cancelledAfterAccept ?? 0,
					refusals: change.refusals ?? [],
					blockedOverride: "none",
					tier: change.tier,
				},
				overrideAccess: true,
				req,
			});
			return;
		} catch {
			const row = await readRow(req.payload, phoneHash);
			await writeRow(req, phoneHash, row, change);
			return;
		}
	}
	const data: Doc = { tier: change.tier };
	for (const [field, delta] of Object.entries(change.counters ?? {})) {
		data[field] = { $inc: delta };
	}
	if (change.refusals) data.refusals = change.refusals;
	await req.payload.db.updateOne({
		collection: "buyer-phone-scores",
		where: { phoneHash: { equals: phoneHash } },
		data,
		req,
		returning: true,
	});
}

/** Read path: no write, so this is safe to call on every checkout quote. */
export async function tierFor(
	payload: Payload,
	phone: string,
	now: Date,
): Promise<BuyerTierKey> {
	const row = await readRow(payload, hashPhone(phone));
	return tierOf(row, now);
}

/**
 * Scores both phones a checkout carries and keeps the worse tier: the whole
 * reason `phoneHash` exists is that a buyer who burns an account keeps their
 * number, so a fresh account on a phone with a bad history must not read as
 * a fresh buyer. `refusals`/`deliveryPhoneHash` describe the delivery leg —
 * the pair this value is stored against in `order.risk` at placement.
 */
export async function scoreCheckout(
	payload: Payload,
	phones: { accountPhone: string | null; deliveryPhone: string },
	now: Date,
): Promise<{
	tier: BuyerTierKey;
	refusals: number;
	deliveryPhoneHash: string;
}> {
	const deliveryPhoneHash = hashPhone(phones.deliveryPhone);
	const deliveryRow = await readRow(payload, deliveryPhoneHash);
	const deliveryTier = tierOf(deliveryRow, now);
	const accountTier = phones.accountPhone
		? tierOf(await readRow(payload, hashPhone(phones.accountPhone)), now)
		: deliveryTier;
	return {
		tier: worseTier(accountTier, deliveryTier),
		refusals: deliveryRow
			? countRefusals(toCounted(deliveryRow.refusals), now)
			: 0,
		deliveryPhoneHash,
	};
}

export async function recordPlacement(
	req: PayloadRequest,
	input: { phone: string; orderId: string },
): Promise<void> {
	const phoneHash = hashPhone(input.phone);
	const row = await readRow(req.payload, phoneHash);
	const now = new Date();
	const tier = computeTier({
		refusals: countRefusals(toCounted(row?.refusals ?? []), now),
		delivered: row?.ordersDelivered ?? 0,
		override: row?.blockedOverride ?? "none",
	});
	await writeRow(req, phoneHash, row, { counters: { ordersPlaced: 1 }, tier });
}

/**
 * Every write here goes through `req`, so it joins the caller's transaction
 * (same reasoning as `nextInvoiceNumber`, unlike `nextNumber`'s deliberate
 * exception). A replayed delivery — the handler retried after an aborted
 * transaction — never double-counts: the first attempt's write rolls back
 * with the rest of that transaction, and only the attempt that actually
 * commits lands here.
 */
export async function recordDelivered(
	req: PayloadRequest,
	input: { phone: string; orderId: string },
): Promise<void> {
	const phoneHash = hashPhone(input.phone);
	const row = await readRow(req.payload, phoneHash);
	const now = new Date();
	const tier = computeTier({
		refusals: countRefusals(toCounted(row?.refusals ?? []), now),
		delivered: (row?.ordersDelivered ?? 0) + 1,
		override: row?.blockedOverride ?? "none",
	});
	await writeRow(req, phoneHash, row, {
		counters: { ordersDelivered: 1 },
		tier,
	});
}

export async function recordRefusal(
	req: PayloadRequest,
	input: { phone: string; orderId: string; reason: string },
): Promise<void> {
	if (!isScoredRefusal(input.reason)) return;
	const phoneHash = hashPhone(input.phone);
	const row = await readRow(req.payload, phoneHash);
	if (alreadyCounted(row, input.orderId, input.reason)) return;
	const now = new Date();
	const refusals: RefusalEntry[] = [
		...(row?.refusals ?? []),
		{ order: input.orderId, reason: input.reason, at: now.toISOString() },
	].slice(-MAX_REFUSALS_KEPT);
	const tier = computeTier({
		refusals: countRefusals(toCounted(refusals), now),
		delivered: row?.ordersDelivered ?? 0,
		override: row?.blockedOverride ?? "none",
	});
	await writeRow(req, phoneHash, row, { refusals, tier });
}

/** Same transactional replay safety as `recordDelivered`. */
export async function recordCancelAfterAccept(
	req: PayloadRequest,
	input: { phone: string; orderId: string },
): Promise<void> {
	const phoneHash = hashPhone(input.phone);
	const row = await readRow(req.payload, phoneHash);
	const now = new Date();
	const tier = computeTier({
		refusals: countRefusals(toCounted(row?.refusals ?? []), now),
		delivered: row?.ordersDelivered ?? 0,
		override: row?.blockedOverride ?? "none",
	});
	await writeRow(req, phoneHash, row, {
		counters: { cancelledAfterAccept: 1 },
		tier,
	});
}
