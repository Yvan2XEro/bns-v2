import type { MarketConfig } from "../../../api/src/contracts/marketConfig";

export const NNBSP = "\u202f";

export const marketFixture = (
	over: Partial<MarketConfig> = {},
): MarketConfig => ({
	countryCode: "CM",
	name: "Cameroon",
	currency: { code: "XAF", minorUnit: 0 },
	formats: [
		{
			locale: "fr",
			symbol: "FCFA",
			position: "after",
			groupSeparator: NNBSP,
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
	phone: { pattern: "^\\+2376\\d{8}$", displayExample: "+237 6XX XX XX XX" },
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
	...over,
});
