import type { MarketConfig } from "../../../api/src/contracts/marketConfig";
import { E164_PATTERN } from "./phone-input";

export interface MarketPhoneRule {
	pattern: RegExp;
	placeholder: string | undefined;
	/** For error copy, which needs an example even with no market block. */
	example: string;
}

const FALLBACK_EXAMPLE = "+CCXXXXXXXX";

/**
 * The served pattern is a RegExp source compiled here. Without a market block
 * the only claim left is the E.164 shape every `PhoneInput` already emits.
 */
export function marketPhoneRule(
	market: Pick<MarketConfig, "phone"> | undefined,
): MarketPhoneRule {
	if (!market)
		return {
			pattern: E164_PATTERN,
			placeholder: undefined,
			example: FALLBACK_EXAMPLE,
		};
	return {
		pattern: new RegExp(market.phone.pattern),
		placeholder: market.phone.displayExample,
		example: market.phone.displayExample,
	};
}
