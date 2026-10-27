import type { MarketConfig } from "../../../src/contracts/marketConfig";
import { marketOf } from "../../../src/lib/markets";
import { CM_FORMATTING } from "../../../src/seed/seedMarkets";
import { DELIVERY_PHONE_PATTERN } from "../../../src/services/checkout";

type Row = Record<string, unknown>;

/** The Cameroon row exactly as the P10 migration seeds it. */
export const cmRow = (over: Row = {}): Row => ({
	id: "m-cm",
	countryCode: "CM",
	name: "Cameroon",
	status: "live",
	currency: { code: "XAF", minorUnit: 0, rounding: "half_up" },
	formatting: CM_FORMATTING,
	phone: {
		pattern: DELIVERY_PHONE_PATTERN.source,
		displayExample: "+237 6XX XX XX XX",
	},
	timezone: "Africa/Douala",
	languages: ["fr", "en"],
	vatRateBps: 1925,
	payments: {
		provider: "notchpay",
		settlementMode: "provider_split",
		channels: [],
		enabled: true,
	},
	features: {},
	amounts: {
		minPayout: 0,
		maxOrderAmount: 0,
		exposureLevel2: 0,
		exposureLevel3: 0,
		buyerProtectionMin: 0,
		buyerProtectionMax: 0,
		defaultDeliveryFeeFallback: 0,
	},
	moneyCalendar: {
		releaseHourLocal: 6,
		reconcileHourLocal: 3,
		vatPeriod: "calendar_month",
	},
	updatedAt: "2026-10-01T00:00:00.000Z",
	...over,
});

/** A two-decimal market the CM rows can never exercise. */
export const decimalRow = (): Row =>
	cmRow({
		id: "m-xx",
		countryCode: "GB",
		name: "Decimalia",
		currency: { code: "GBP", minorUnit: 2, rounding: "half_up" },
		formatting: [
			{
				locale: "fr",
				symbol: "£",
				position: "before",
				groupSeparator: " ",
				decimalSeparator: ",",
			},
			{
				locale: "en",
				symbol: "£",
				position: "before",
				groupSeparator: ",",
				decimalSeparator: ".",
			},
		],
		phone: { pattern: "^\\+44\\d{10}$", displayExample: "+44 7XXX XXXXXX" },
	});

/**
 * What GET /api/public/config serves for a market row: the api's own
 * `marketOf` normalises it (stamping the currency's minorUnit on every format
 * row), and both clients consume the result.
 */
export function served(
	row: Row,
): Pick<MarketConfig, "currency" | "formats" | "phone"> {
	const market = marketOf(row);
	if (!market) throw new Error("the market row does not normalise");
	return {
		currency: {
			code: market.currency.code,
			minorUnit: market.currency.minorUnit,
		},
		formats: market.formats,
		phone: market.phone,
	};
}

/** The served block as a mobile client stores it. */
export function servedConfig(row: Row): MarketConfig {
	const market = marketOf(row);
	return {
		...served(row),
		countryCode: market?.countryCode ?? "",
		name: market?.name ?? "",
		cities: [],
		features: {
			cod: true,
			protectedPayment: true,
			deliveryZones: true,
			couriers: true,
			disputes: true,
			resale: true,
			resalePrepaid: true,
			boosts: true,
		},
		languages: ["fr", "en"],
	};
}
