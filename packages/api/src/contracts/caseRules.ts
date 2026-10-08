import { ERROR_CODES } from "../lib/errors";
import type { ReturnCase } from "../payload-types";

export type CaseBasis = ReturnCase["basis"];
export interface DeductionAllowedInput {
	basis: CaseBasis;
	itemPrice: number;
	amount: number;
}
export type DeductionAllowedResult =
	| { ok: true }
	| {
			ok: false;
			code:
				| typeof ERROR_CODES.returnDeductionNotAllowed
				| typeof ERROR_CODES.returnItemsInvalid;
	  };

/** Non-conformity cannot be charged to the buyer; other deductions are capped by the returned item's value. */
export function deductionAllowed({
	basis,
	itemPrice,
	amount,
}: DeductionAllowedInput): DeductionAllowedResult {
	if (basis === "non_conformity")
		return { ok: false, code: ERROR_CODES.returnDeductionNotAllowed };
	if (amount > itemPrice)
		return { ok: false, code: ERROR_CODES.returnItemsInvalid };
	return { ok: true };
}
