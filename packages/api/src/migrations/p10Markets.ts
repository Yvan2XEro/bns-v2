import { ObjectId } from "mongodb";
import type { Payload } from "payload";
import { getDeliverySettings } from "../lib/deliverySettings";
import { LAUNCH_CITIES, launchCitySeedRows } from "../lib/launchCities";
import { getOrderSettings } from "../lib/orderSettings";
import { DEFAULT_MARKETS, paymentSettingsOf } from "../lib/paymentSettings";
import { DELIVERY_PHONE_PATTERN } from "../services/checkout";

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec =>
	value !== null && typeof value === "object" ? (value as Rec) : {};

interface RawCollection {
	insertOne(doc: Rec): Promise<unknown>;
	updateOne(filter: Rec, update: Rec): Promise<unknown>;
	updateMany(filter: Rec, update: Rec): Promise<unknown>;
}

interface RawAdapter {
	collections: Record<string, { collection: RawCollection }>;
	globals: { updateOne(filter: Rec, update: Rec): Promise<unknown> };
}

const raw = (payload: Payload, slug: string): RawCollection =>
	(payload.db as unknown as RawAdapter).collections[slug].collection;

export const CM = "CM";
const NARROW_NBSP = " ";

/** Today's `formatXaf`, as the two rows `formatMoney` reproduces it from. */
export const CM_FORMATTING = [
	{
		locale: "fr",
		symbol: "FCFA",
		position: "after",
		groupSeparator: NARROW_NBSP,
		decimalSeparator: ",",
	},
	{
		locale: "en",
		symbol: "XAF",
		position: "before",
		groupSeparator: ",",
		decimalSeparator: ".",
	},
] as const;

const rowId = () => new ObjectId().toHexString();

function filedEvidenceId(gates: unknown): string | null {
	const rows = (Array.isArray(gates) ? gates : []).map(rec);
	rows.sort((a, b) => String(a.gate).localeCompare(String(b.gate)));
	for (const row of rows) {
		const evidence = rec(row.evidence).id ?? row.evidence;
		if (typeof evidence === "string" && evidence) return evidence;
	}
	return null;
}

async function ensureMarket(payload: Payload): Promise<string> {
	const existing = await payload.find({
		collection: "markets",
		where: { countryCode: { equals: CM } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	if (existing.docs[0]) return String(existing.docs[0].id);

	const global = rec(
		await payload.findGlobal({ slug: "app-settings", depth: 0 }),
	);
	const payments = paymentSettingsOf(global.payments);
	const live =
		payments.markets.find((m) => m.countryCode === CM) ?? DEFAULT_MARKETS[0];
	const orders = await getOrderSettings(payload);
	const delivery = await getDeliverySettings(payload);
	const resale = rec(global.resale);
	const evidence = filedEvidenceId(rec(global.payments).gates);
	const now = new Date();
	const _id = new ObjectId();

	await raw(payload, "markets").insertOne({
		_id,
		countryCode: CM,
		name: "Cameroon",
		status: "live",
		currency: { code: live.currency, minorUnit: 0, rounding: "half_up" },
		formatting: CM_FORMATTING.map((f) => ({ id: rowId(), ...f })),
		phone: {
			pattern: DELIVERY_PHONE_PATTERN.source,
			examples: {
				valid: ["+237650000001"],
				invalid: ["+2371650000001", "+23765000000"],
			},
			displayExample: "+237 6XX XX XX XX",
		},
		timezone: "Africa/Douala",
		languages: ["fr", "en"],
		vatRateBps: orders.vatRateBps,
		payments: {
			provider: live.provider,
			settlementMode: live.settlementMode,
			channels: [...live.channels],
			enabled: live.enabled,
		},
		features: {
			cod: orders.enabled,
			protectedPayment: payments.protectedPayment.enabled,
			deliveryZones: delivery.zonesEnabled,
			couriers: delivery.couriersEnabled,
			disputes: rec(global.disputes).enabled === true,
			resale: resale.enabled === true,
			resalePrepaid: resale.prepaidEnabled === true,
			boosts: payments.protectedPayment.enabled,
		},
		amounts: {
			minPayout: payments.minPayout,
			maxOrderAmount: payments.maxOrderAmount,
			exposureLevel2: payments.exposureCaps.level2,
			exposureLevel3: payments.exposureCaps.level3,
			buyerProtectionMin: payments.buyerProtection.min,
			buyerProtectionMax: payments.buyerProtection.max,
			defaultDeliveryFeeFallback: LAUNCH_CITIES.douala.defaultDeliveryFee,
		},
		regulatoryReview: {
			reviewedBy: "p10 migration",
			reviewedAt: now,
			...(evidence ? { evidence: new ObjectId(evidence) } : {}),
			note: "Carried over from the P5 gate record.",
		},
		moneyCalendar: {
			releaseHourLocal: 10,
			reconcileHourLocal: 2,
			vatPeriod: "calendar_month",
		},
		createdAt: now,
		updatedAt: now,
	});
	if (evidence) {
		await raw(payload, "payment-gate-evidence").updateOne(
			{ _id: new ObjectId(evidence) },
			{ $set: { scope: "market" } },
		);
	} else {
		payload.logger.warn({
			msg: "[migration] P10: no P5 gate evidence is filed, so the CM market is live without a review record; file one before editing it",
		});
	}
	return String(_id);
}

async function ensureCities(payload: Payload, marketId: string) {
	const { launchCities } = await getOrderSettings(payload);
	const { docs } = await payload.find({
		collection: "market-cities",
		where: { market: { equals: marketId } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const have = new Set(docs.map((d) => d.key));
	const now = new Date();
	for (const seed of launchCitySeedRows(marketId)) {
		if (have.has(seed.key)) continue;
		// A city missing from the stored list is closed today; it stays closed.
		const open = launchCities.find((c) => c.key === seed.key);
		await raw(payload, "market-cities").insertOne({
			_id: new ObjectId(),
			market: new ObjectId(marketId),
			key: seed.key,
			label: seed.label,
			defaultDeliveryFee: open?.deliveryFee ?? seed.defaultDeliveryFee,
			districts: seed.districts.map((d) => ({ id: rowId(), ...d })),
			active: open !== undefined,
			sortOrder: seed.sortOrder,
			createdAt: now,
			updatedAt: now,
		});
	}
	await (payload.db as unknown as RawAdapter).globals.updateOne(
		{ globalType: "app-settings" },
		{ $set: { "orders.launchCities": [] } },
	);
}

async function backfill(payload: Payload, marketId: string) {
	const { docs } = await payload.find({
		collection: "markets",
		where: { id: { equals: marketId } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const market = docs[0];
	const formatSnapshot = (
		Array.isArray(market?.formatting) ? market.formatting : []
	).map((f) => ({
		id: rowId(),
		locale: f.locale,
		symbol: f.symbol,
		position: f.position,
		groupSeparator: f.groupSeparator,
		decimalSeparator: f.decimalSeparator,
		minorUnit: 0,
	}));
	const id = new ObjectId(marketId);
	// Existing documents already store "XAF"; only a missing value is filled.
	await raw(payload, "orders").updateMany(
		{ market: null },
		{ $set: { market: id } },
	);
	await raw(payload, "orders").updateMany(
		{ "amounts.currency": null },
		{ $set: { "amounts.currency": "XAF" } },
	);
	await raw(payload, "carts").updateMany(
		{ market: null },
		{ $set: { market: id } },
	);
	for (const slug of ["commission-invoices", "buyer-fee-invoices"]) {
		await raw(payload, slug).updateMany(
			{ currency: null },
			{ $set: { currency: "XAF" } },
		);
		await raw(payload, slug).updateMany(
			{ "formatSnapshot.0": { $exists: false } },
			{ $set: { formatSnapshot } },
		);
	}
}

/** `{key}:CM` continues CM's numbering; raised, never lowered, so a re-run is a no-op. */
async function copySequences(payload: Payload) {
	const { docs } = await payload.find({
		collection: "sequences",
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const byKey = new Map(docs.map((d) => [d.key, d]));
	for (const doc of docs) {
		if (doc.key.endsWith(`:${CM}`)) continue;
		const sibling = byKey.get(`${doc.key}:${CM}`);
		if (!sibling) {
			await payload.create({
				collection: "sequences",
				data: { key: `${doc.key}:${CM}`, value: doc.value },
				overrideAccess: true,
			});
		} else if (sibling.value < doc.value) {
			await payload.update({
				collection: "sequences",
				id: sibling.id,
				data: { value: doc.value },
				overrideAccess: true,
			});
		}
	}
}

export async function migrateP10Markets(payload: Payload): Promise<void> {
	const marketId = await ensureMarket(payload);
	await ensureCities(payload, marketId);
	await backfill(payload, marketId);
	await copySequences(payload);
}
