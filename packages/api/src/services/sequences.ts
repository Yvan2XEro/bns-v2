import type { Payload, PayloadRequest } from "payload";
import { type Market, marketOfOrder, marketOfShop } from "../lib/markets";
import { LEGACY_TIMEZONE, localMonthKey } from "../lib/marketTime";
import { relationId } from "../lib/relationId";
import type { Order, Shop } from "../payload-types";

/** The slice of a market a counter needs: whose series, on whose clock. */
export type SequenceMarket = Pick<Market, "countryCode" | "timezone">;

/** Callers that predate markets keep Cameroon's series until they pass theirs. */
const LEGACY_MARKET: SequenceMarket = {
	countryCode: "CM",
	timezone: LEGACY_TIMEZONE,
};

/** `YYMM` on the market's wall clock — a checkout at 00:10 local must not land in last month. */
export function monthKeyFor(
	date: Date,
	timezone: string = LEGACY_TIMEZONE,
): string {
	return localMonthKey(date, timezone);
}

function yearKeyFor(date: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: LEGACY_TIMEZONE,
		year: "numeric",
	}).format(date);
}

/** The series an order's documents number in; an order no market claims keeps the legacy series. */
export async function sequenceMarketOfOrder(
	payload: Payload,
	order: Pick<Order, "market" | "amounts">,
): Promise<SequenceMarket> {
	const market = await marketOfOrder(payload, order);
	if (market) return market;
	// A stamp that resolves to nothing is a dangling relationship, not a pre-P10 order.
	if (order.market) {
		payload.logger.warn(
			`[sequences] order market ${relationId(order.market)} not found, numbering in the legacy series`,
		);
	}
	return LEGACY_MARKET;
}

export async function sequenceMarketOfShop(
	payload: Payload,
	shop: Pick<Shop, "location">,
): Promise<SequenceMarket> {
	return marketOfShop(payload, shop).catch(() => LEGACY_MARKET);
}

export function formatSequence(
	prefix: string,
	monthKey: string,
	value: number,
	width: number,
): string {
	return `${prefix}-${monthKey}-${String(value).padStart(width, "0")}`;
}

async function bump(
	payload: Payload,
	key: string,
	req?: PayloadRequest,
): Promise<number> {
	const row: unknown = await payload.db.updateOne({
		collection: "sequences",
		where: { key: { equals: key } },
		data: { value: { $inc: 1 } },
		...(req ? { req } : {}),
		returning: true,
	});
	if (row && typeof row === "object" && "value" in row) {
		return Number((row as { value: unknown }).value);
	}
	// First use of this key. A concurrent creator wins the unique index; we
	// then retry the increment, which now finds the row.
	try {
		const created = await payload.create({
			collection: "sequences",
			data: { key, value: 1 },
			overrideAccess: true,
			...(req ? { req } : {}),
		});
		return Number(created.value);
	} catch {
		return bump(payload, key, req);
	}
}

/**
 * Monthly series, gaps allowed. Deliberately takes `payload` rather than a
 * `req`: it must run OUTSIDE the caller's transaction, or two concurrent
 * checkouts contend on one counter document and Mongo aborts one of them
 * (A1). The cost is a burnt number when a checkout then fails, which the
 * spec accepts.
 */
export async function nextNumber(
	payload: Payload,
	prefix: string,
	date: Date,
	market: SequenceMarket = LEGACY_MARKET,
	options: { width?: number } = {},
): Promise<string> {
	const width = options.width ?? 6;
	const monthKey = monthKeyFor(date, market.timezone);
	const value = await bump(
		payload,
		`${prefix}:${monthKey}:${market.countryCode}`,
	);
	return formatSequence(prefix, monthKey, value, width);
}

/**
 * Yearly invoice series, NO gaps — a tax authority reads these. It runs
 * INSIDE the caller's transaction, so an aborted invoice releases its number.
 */
export async function nextInvoiceNumber(
	req: PayloadRequest,
	series: "C" | "F" | "A",
	date: Date,
): Promise<string> {
	const year = yearKeyFor(date);
	const value = await bump(req.payload, `invoice:${series}:${year}`, req);
	return `BNS-${series}-${year}-${String(value).padStart(6, "0")}`;
}
