import type { Payload, PayloadRequest } from "payload";

const DOUALA = "Africa/Douala";

/** `YYMM` in Africa/Douala — a checkout at 00:10 local must not land in last month. */
export function monthKeyFor(date: Date): string {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: DOUALA,
		year: "2-digit",
		month: "2-digit",
	}).formatToParts(date);
	const year = parts.find((p) => p.type === "year")?.value ?? "00";
	const month = parts.find((p) => p.type === "month")?.value ?? "01";
	return `${year}${month}`;
}

function yearKeyFor(date: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: DOUALA,
		year: "numeric",
	}).format(date);
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
	options: { width?: number } = {},
): Promise<string> {
	const width = options.width ?? 6;
	const monthKey = monthKeyFor(date);
	const value = await bump(payload, `${prefix}:${monthKey}`);
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
