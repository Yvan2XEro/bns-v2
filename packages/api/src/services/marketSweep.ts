import type { Payload } from "payload";
import { localDateAndHour } from "../lib/localTime";
import { getMarkets, type Market } from "../lib/markets";

export type SweepKind = "release" | "reconcile";

const FIELDS = {
	release: { hour: "releaseHourLocal", stamp: "lastReleaseLocalDate" },
	reconcile: { hour: "reconcileHourLocal", stamp: "lastReconcileLocalDate" },
} as const;

export type SweepOutcome<T> =
	| { ran: false }
	| { ran: true; result: T; markets: string[] };

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec =>
	v !== null && typeof v === "object" ? (v as Rec) : {};

/**
 * The crons fire hourly in UTC; each market's own local hour (and day stamp)
 * decides whether it is due. The body is not market-scoped (one provider account), so it runs
 * once for however many markets are due, and each one's stamp is written only
 * after it succeeds: a failed run leaves the day unstamped and the job's retry
 * runs it again.
 */
export async function runMarketSweep<T>(
	payload: Payload,
	kind: SweepKind,
	body: () => Promise<T>,
	now = new Date(),
): Promise<SweepOutcome<T>> {
	const field = FIELDS[kind];
	const due: { market: Market; date: string }[] = [];
	for (const market of await getMarkets(payload)) {
		const local = localDateAndHour(now, market.timezone);
		// Catch-up, not a strict hour: a worker down through the market's hour
		// still runs it later the same local day. The day stamp below is what
		// keeps `>=` from running it twice.
		if (local.hour < market.moneyCalendar[field.hour]) continue;
		// Fresh read: the market list is cached for a minute, the stamp must not be.
		const doc = await payload.findByID({
			collection: "markets",
			id: market.id,
			depth: 0,
			overrideAccess: true,
		});
		if (rec(rec(doc).moneyCalendar)[field.stamp] === local.date) continue;
		due.push({ market, date: local.date });
	}
	if (due.length === 0) return { ran: false };

	const result = await body();
	for (const { market, date } of due) await stamp(payload, market, kind, date);
	return { ran: true, result, markets: due.map((d) => d.market.countryCode) };
}

async function stamp(
	payload: Payload,
	market: Market,
	kind: SweepKind,
	date: string,
) {
	const doc = await payload.findByID({
		collection: "markets",
		id: market.id,
		depth: 0,
		overrideAccess: true,
	});
	// db.updateOne skips the market save hooks: a stamp is bookkeeping, not an edit.
	await payload.db.updateOne({
		collection: "markets",
		id: market.id,
		data: {
			moneyCalendar: {
				...rec(rec(doc).moneyCalendar),
				[FIELDS[kind].stamp]: date,
			},
		},
	});
}
