import type { MoneyFormat } from "./money";

/** The `market` block of GET /api/public/config; absent for an unknown or non-live country. */
export interface MarketConfig {
	countryCode: string;
	name: string;
	currency: { code: string; minorUnit: number };
	formats: MoneyFormat[];
	/** `pattern` is a RegExp source, compiled by the client. */
	phone: { pattern: string; displayExample: string };
	cities: Array<{
		key: string;
		label: string;
		districts: Array<{ key: string; label: string }>;
		fee: number;
	}>;
	features: {
		cod: boolean;
		protectedPayment: boolean;
		deliveryZones: boolean;
		couriers: boolean;
		disputes: boolean;
		resale: boolean;
		resalePrepaid: boolean;
		boosts: boolean;
	};
	languages: Array<"fr" | "en">;
}
