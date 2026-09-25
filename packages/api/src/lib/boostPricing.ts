export interface BoostPrice {
	days: number;
	amount: number;
	currency: "XAF";
}

/** The only boost price list; clients read it from GET /api/public/config. */
export const BOOST_PRICING: readonly BoostPrice[] = [
	{ days: 7, amount: 500, currency: "XAF" },
	{ days: 14, amount: 900, currency: "XAF" },
	{ days: 30, amount: 1500, currency: "XAF" },
];

export function findBoostPrice(duration: unknown): BoostPrice | null {
	const days =
		typeof duration === "number"
			? duration
			: typeof duration === "string" && /^\d+$/.test(duration)
				? Number(duration)
				: Number.NaN;
	return BOOST_PRICING.find((price) => price.days === days) ?? null;
}
