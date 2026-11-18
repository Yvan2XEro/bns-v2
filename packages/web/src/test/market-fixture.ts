import type { MarketConfig } from "../../../api/src/contracts/marketConfig";

export const NARROW_NBSP = " ";

/** The Cameroon market block as GET /api/public/config?country=CM serves it. */
export function cmMarket(overrides: Partial<MarketConfig> = {}): MarketConfig {
	return {
		countryCode: "CM",
		name: "Cameroon",
		currency: { code: "XAF", minorUnit: 0 },
		formats: [
			{
				locale: "fr",
				symbol: "FCFA",
				position: "after",
				groupSeparator: NARROW_NBSP,
				decimalSeparator: ",",
				minorUnit: 0,
			},
			{
				locale: "en",
				symbol: "XAF",
				position: "before",
				groupSeparator: ",",
				decimalSeparator: ".",
				minorUnit: 0,
			},
		],
		phone: { pattern: "^\\+2376\\d{8}$", displayExample: "+237650000001" },
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
		...overrides,
	};
}
