import type { Payload } from "payload";
import {
	MARKET_FEATURES,
	MARKET_STATUSES,
	type MarketStatus,
} from "../collections/Markets";
import type { MoneyFormat } from "../contracts/money";
import type { Shop } from "../payload-types";
import { ERROR_CODES } from "./errors";
import { readMarketCache, writeMarketCache } from "./marketCache";
import type { Rounding } from "./paymentMath";
import { PAYMENT_PROVIDERS, type PaymentProviderId } from "./paymentSettings";
import { ServiceError } from "./serviceError";

export type MarketFeature = (typeof MARKET_FEATURES)[number];

export interface Market {
	id: string;
	countryCode: string;
	name: string;
	status: MarketStatus;
	currency: { code: string; minorUnit: number; rounding: Rounding };
	formats: MoneyFormat[];
	phone: { pattern: string; displayExample: string };
	timezone: string;
	languages: ("fr" | "en")[];
	vatRateBps: number;
	payments: {
		provider: PaymentProviderId;
		settlementMode: "provider_split";
		channels: string[];
		enabled: boolean;
	};
	features: Record<MarketFeature, boolean>;
	amounts: {
		minPayout: number;
		maxOrderAmount: number;
		exposureLevel2: number;
		exposureLevel3: number;
		buyerProtectionMin: number;
		buyerProtectionMax: number;
		defaultDeliveryFeeFallback: number;
	};
	moneyCalendar: {
		releaseHourLocal: number;
		reconcileHourLocal: number;
		vatPeriod: "calendar_month";
	};
	updatedAt: string;
}

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec =>
	value !== null && typeof value === "object" ? (value as Rec) : {};

const ROUNDINGS: readonly Rounding[] = ["half_up", "half_even", "down"];
const LANGUAGES = ["fr", "en"] as const;
const CHANNEL = /^[a-z]{2}\.[a-z0-9_]{2,20}$/;

const text = (value: unknown): string | null =>
	typeof value === "string" && value !== "" ? value : null;
const int = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
	typeof value === "number" &&
	Number.isInteger(value) &&
	value >= min &&
	value <= max
		? value
		: null;
const oneOf = <T extends string>(
	values: readonly T[],
	value: unknown,
): T | null =>
	typeof value === "string" && (values as readonly string[]).includes(value)
		? (value as T)
		: null;

function compiles(source: string): boolean {
	try {
		new RegExp(source);
		return true;
	} catch {
		return false;
	}
}

function knownTimezone(zone: string): boolean {
	try {
		new Intl.DateTimeFormat("en", { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

function formatsOf(value: unknown, minorUnit: number): MoneyFormat[] | null {
	if (value == null) return [];
	if (!Array.isArray(value)) return null;
	const out: MoneyFormat[] = [];
	for (const raw of value) {
		const row = rec(raw);
		const locale = oneOf(LANGUAGES, row.locale);
		const position = oneOf(["before", "after"] as const, row.position);
		const symbol = text(row.symbol);
		const groupSeparator = text(row.groupSeparator);
		const decimalSeparator = text(row.decimalSeparator);
		if (
			!locale ||
			!position ||
			!symbol ||
			groupSeparator === null ||
			decimalSeparator === null
		)
			return null;
		out.push({
			locale,
			symbol,
			position,
			groupSeparator,
			decimalSeparator,
			minorUnit,
		});
	}
	return out;
}

/**
 * A market the money path can act on, or null. Like `paymentSettingsOf`, a
 * document that is not exactly right is dropped, never repaired: a defaulted
 * currency would charge one country's buyers in another's money.
 */
export function marketOf(value: unknown): Market | null {
	const doc = rec(value);
	const id = doc.id == null ? null : String(doc.id);
	const countryCode = text(doc.countryCode);
	const name = text(doc.name);
	const status = oneOf(MARKET_STATUSES, doc.status);
	const updatedAt = text(doc.updatedAt);
	if (!id || !countryCode || !/^[A-Z]{2}$/.test(countryCode)) return null;
	if (!name || !status || !updatedAt) return null;

	const cur = rec(doc.currency);
	const code = text(cur.code);
	const minorUnit = int(cur.minorUnit, 0, 3);
	const rounding = oneOf(ROUNDINGS, cur.rounding);
	if (!code || !/^[A-Z]{3}$/.test(code) || minorUnit === null || !rounding)
		return null;
	const formats = formatsOf(doc.formatting, minorUnit);
	if (!formats) return null;

	const phone = rec(doc.phone);
	const pattern = text(phone.pattern);
	if (!pattern || !compiles(pattern)) return null;
	const timezone = text(doc.timezone);
	if (!timezone || !knownTimezone(timezone)) return null;

	const languages = Array.isArray(doc.languages)
		? doc.languages.map((l) => oneOf(LANGUAGES, l))
		: [];
	if (languages.length === 0 || languages.some((l) => l === null)) return null;
	const vatRateBps = int(doc.vatRateBps, 0, 10_000);
	if (vatRateBps === null) return null;

	const pay = rec(doc.payments);
	const provider = oneOf(PAYMENT_PROVIDERS, pay.provider);
	const channels = pay.channels == null ? [] : pay.channels;
	if (
		!provider ||
		pay.settlementMode !== "provider_split" ||
		!Array.isArray(channels) ||
		!channels.every((c) => typeof c === "string" && CHANNEL.test(c))
	)
		return null;

	const feat = rec(doc.features);
	const features = Object.fromEntries(
		MARKET_FEATURES.map((f) => [f, feat[f] === true]),
	) as Record<MarketFeature, boolean>;

	const amt = rec(doc.amounts);
	const amounts = {
		minPayout: int(amt.minPayout, 0),
		maxOrderAmount: int(amt.maxOrderAmount, 0),
		exposureLevel2: int(amt.exposureLevel2, 0),
		exposureLevel3: int(amt.exposureLevel3, 0),
		buyerProtectionMin: int(amt.buyerProtectionMin, 0),
		buyerProtectionMax: int(amt.buyerProtectionMax, 0),
		defaultDeliveryFeeFallback: int(amt.defaultDeliveryFeeFallback, 0),
	};
	if (Object.values(amounts).some((v) => v === null)) return null;

	const cal = rec(doc.moneyCalendar);
	const releaseHourLocal = int(cal.releaseHourLocal, 0, 23);
	const reconcileHourLocal = int(cal.reconcileHourLocal, 0, 23);
	if (
		releaseHourLocal === null ||
		reconcileHourLocal === null ||
		cal.vatPeriod !== "calendar_month"
	)
		return null;

	return {
		id,
		countryCode,
		name,
		status,
		currency: { code, minorUnit, rounding },
		formats,
		phone: { pattern, displayExample: text(phone.displayExample) ?? "" },
		timezone,
		languages: languages as ("fr" | "en")[],
		vatRateBps,
		payments: {
			provider,
			settlementMode: "provider_split",
			channels: channels as string[],
			enabled: pay.enabled === true,
		},
		features,
		amounts: amounts as Market["amounts"],
		moneyCalendar: {
			releaseHourLocal,
			reconcileHourLocal,
			vatPeriod: "calendar_month",
		},
		updatedAt,
	};
}

export async function getMarkets(payload: Payload): Promise<Market[]> {
	const cached = readMarketCache<Market[]>(payload);
	if (cached) return cached;
	const { docs } = await payload.find({
		collection: "markets",
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const valid = docs.flatMap((doc) => {
		const market = marketOf(doc);
		return market ? [market] : [];
	});
	// A country listed twice is ambiguous; neither row is trusted.
	const list = valid.filter(
		(m) => valid.filter((o) => o.countryCode === m.countryCode).length === 1,
	);
	writeMarketCache(payload, list);
	return list;
}

export async function getMarket(
	payload: Payload,
	countryCode: string,
): Promise<Market> {
	const code = countryCode.trim().toUpperCase();
	const market = (await getMarkets(payload)).find(
		(m) => m.countryCode === code,
	);
	if (!market) throw new ServiceError(ERROR_CODES.marketUnknown, 404);
	return market;
}

export async function getLiveMarket(
	payload: Payload,
	countryCode: string,
): Promise<Market> {
	const market = await getMarket(payload, countryCode);
	if (market.status !== "live")
		throw new ServiceError(ERROR_CODES.marketNotLive, 409);
	return market;
}

export function marketIsOpen(
	market: Market,
	feature: MarketFeature,
	globallyEnabled: boolean,
): boolean {
	return (
		market.status === "live" && market.features[feature] && globallyEnabled
	);
}

/** A shop belongs to one market through its city's row; no row means unknown. */
export async function marketOfShop(
	payload: Payload,
	shop: Shop,
): Promise<Market> {
	const key = shop.location?.city?.trim().toLowerCase();
	if (!key) throw new ServiceError(ERROR_CODES.marketUnknown, 404);
	const { docs } = await payload.find({
		collection: "market-cities",
		where: { key: { equals: key } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const ids = new Set(
		docs.map((d) => {
			const m = d.market;
			return String(typeof m === "object" && m !== null ? m.id : m);
		}),
	);
	const markets = (await getMarkets(payload)).filter((m) => ids.has(m.id));
	// A key shared by two markets is ambiguous: the shop's country decides.
	const code = shop.location?.countryCode?.toUpperCase();
	const match = code ? markets.filter((m) => m.countryCode === code) : markets;
	if (match.length !== 1)
		throw new ServiceError(ERROR_CODES.marketUnknown, 404);
	return match[0];
}
