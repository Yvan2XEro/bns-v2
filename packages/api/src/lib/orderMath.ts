/**
 * Money is integer XAF everywhere. Rounding is half **up**, per line, because
 * that is what the invoice shows the seller and what they will add up by hand:
 * rounding on the sum instead can differ by a franc per line, and a seller who
 * finds a franc wrong stops trusting the whole invoice.
 */
export function roundHalfUp(value: number): number {
	return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function commissionForLine(
	lineSubtotal: number,
	rateBps: number,
): number {
	return roundHalfUp((lineSubtotal * rateBps) / 10_000);
}

export function sumCommission(
	lines: ReadonlyArray<{ lineSubtotal: number; rateBps: number }>,
): number {
	return lines.reduce(
		(total, line) => total + commissionForLine(line.lineSubtotal, line.rateBps),
		0,
	);
}

export function vatOf(commissionTotal: number, vatRateBps: number): number {
	return roundHalfUp((commissionTotal * vatRateBps) / 10_000);
}

export function invoiceTotals(input: {
	charges: number;
	credits: number;
	carryOver: number;
	vatRateBps: number;
}): { commissionTotal: number; vatAmount: number; totalDue: number } {
	const commissionTotal = input.charges - input.credits + input.carryOver;
	const vatAmount = vatOf(commissionTotal, input.vatRateBps);
	return { commissionTotal, vatAmount, totalDue: commissionTotal + vatAmount };
}

/**
 * Below the minimum, the lines stay `open` and roll into next week — billing a
 * shop 120 XAF costs more in mobile-money fees than it collects. A negative
 * total (P6 credits exceeding this week's charges) is never invoiced: it
 * becomes a `carry_over` credit line for the next period.
 */
export function netting(input: {
	commissionTotal: number;
	minInvoiceAmount: number;
}): {
	action: "invoice" | "roll_over" | "credit_carry_over";
	carryOver: number;
} {
	if (input.commissionTotal < 0) {
		return {
			action: "credit_carry_over",
			carryOver: Math.abs(input.commissionTotal),
		};
	}
	if (input.commissionTotal < input.minInvoiceAmount) {
		return { action: "roll_over", carryOver: 0 };
	}
	return { action: "invoice", carryOver: 0 };
}

const DOUALA_OFFSET_MS = 60 * 60 * 1000; // Africa/Douala is UTC+1 all year.

/**
 * The last complete week in `Africa/Douala`, Monday 00:00 to Sunday
 * 23:59:59.999, returned as ISO instants. Cameroon has no DST, so a fixed
 * offset is exact — and it is a constant rather than an `Intl` round-trip so
 * the boundary is readable in a test.
 */
export function weekBoundsDouala(now: Date): {
	periodStart: string;
	periodEnd: string;
} {
	const local = new Date(now.getTime() + DOUALA_OFFSET_MS);
	const dayOfWeek = (local.getUTCDay() + 6) % 7; // 0 = Monday
	const localMidnight = Date.UTC(
		local.getUTCFullYear(),
		local.getUTCMonth(),
		local.getUTCDate(),
	);
	const thisMonday = localMidnight - dayOfWeek * 24 * 60 * 60 * 1000;
	const start = thisMonday - 7 * 24 * 60 * 60 * 1000;
	return {
		periodStart: new Date(start - DOUALA_OFFSET_MS).toISOString(),
		periodEnd: new Date(thisMonday - 1 - DOUALA_OFFSET_MS).toISOString(),
	};
}
