import type { BuyerTierKey } from "./orderSettings";

export const REFUSAL_WINDOW_DAYS = 180;

const WEIGHTS: Record<string, number> = {
	refused: 1,
	unreachable: 1,
	absent: 1,
	/** Written by P6 when a `cod_refused_abuse` dispute resolves for the seller. */
	refused_abuse: 2,
};

/** `timeout`, `address_not_found` and `other` are the platform's or the data's fault, not the buyer's. */
export function refusalWeight(reason: string): number {
	return WEIGHTS[reason] ?? 0;
}

export function countRefusals(
	refusals: ReadonlyArray<{ reason: string; at: string }>,
	now: Date,
): number {
	const cutoff = now.getTime() - REFUSAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
	return refusals.reduce((total, row) => {
		const at = Date.parse(row.at);
		if (!Number.isFinite(at) || at < cutoff) return total;
		return total + refusalWeight(row.reason);
	}, 0);
}

const ORDER: readonly BuyerTierKey[] = [
	"blocked",
	"watch",
	"new",
	"regular",
	"trusted",
];

/**
 * Fails closed: missing or ambiguous data (no refusals, no deliveries) maps
 * to `new`, never to `trusted` or `regular` — a buyer with no history is not
 * a trusted buyer. Same direction as P3's cost-privacy guard on a null role.
 */
export function computeTier(input: {
	refusals: number;
	delivered: number;
	override?: "none" | "unblocked" | "blocked";
}): BuyerTierKey {
	if (input.override === "blocked") return "blocked";
	const { refusals: r, delivered: d } = input;
	const share = r + d === 0 ? 0 : r / (r + d);
	if (input.override !== "unblocked" && r >= 3 && share >= 0.5)
		return "blocked";
	if (r >= 2 && share >= 0.34) return "watch";
	if (d >= 3 && r === 0) return "trusted";
	if (d >= 1) return "regular";
	return "new";
}

/** The worse of the account phone's tier and the delivery phone's tier applies. */
export function worseTier(a: BuyerTierKey, b: BuyerTierKey): BuyerTierKey {
	return ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b;
}
