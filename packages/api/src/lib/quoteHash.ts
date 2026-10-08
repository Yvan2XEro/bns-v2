import { sha256 } from "./hash";

export interface QuoteHashInput {
	lines: ReadonlyArray<{
		lineId: string;
		variantId: string;
		quantity: number;
		unitPrice: number;
	}>;
	deliveryFee: number;
	method: "seller_delivery" | "pickup" | "courier";
	optionId?: string;
	deliverySourceUpdatedAt?: string;
	city: string;
	paymentMethod: "cod" | "mobile_money";
	termsVersion: string;
}

/**
 * What the buyer agreed to, in one string. Art. 17 wants the buyer to confirm
 * the summary they were shown, so `place` recomputes this and refuses with
 * `checkout.quoteChanged` on a mismatch rather than charging a price nobody
 * saw. Lines are sorted, because the cart's internal order is not part of the
 * agreement and reordering it must not invalidate a quote.
 */
export function quoteHash(input: QuoteHashInput): string {
	const canonical = {
		lines: [...input.lines]
			.map((line) => ({
				lineId: line.lineId,
				variantId: line.variantId,
				quantity: line.quantity,
				unitPrice: line.unitPrice,
			}))
			.sort((a, b) => (a.lineId < b.lineId ? -1 : a.lineId > b.lineId ? 1 : 0)),
		deliveryFee: input.deliveryFee,
		...(input.optionId ? { optionId: input.optionId } : {}),
		...(input.deliverySourceUpdatedAt
			? { deliverySourceUpdatedAt: input.deliverySourceUpdatedAt }
			: {}),
		method: input.method,
		city: input.city,
		paymentMethod: input.paymentMethod,
		termsVersion: input.termsVersion,
	};
	return sha256(JSON.stringify(canonical));
}
