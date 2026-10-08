import { roundXaf } from "../lib/paymentMath";

interface CommissionCandidate {
	id: string;
	amount: number;
	createdAt: string;
}

interface ChargeCandidate {
	id: string;
	amount: number;
	createdAt: string;
}

export interface ResellerPayoutPlan {
	commissionIds: string[];
	chargeIds: string[];
	grossAmount: number;
	offsetAmount: number;
	amount: number;
	fee: number;
	skipped: "nothing_payable" | "below_minimum" | null;
}

export function planResellerPayout(input: {
	commissions: readonly CommissionCandidate[];
	charges: readonly ChargeCandidate[];
	weeklyCap: number;
	minimum: number;
	capApplies: boolean;
}): ResellerPayoutPlan {
	const cap = input.capApplies ? input.weeklyCap : Number.MAX_SAFE_INTEGER;
	const sortedCommissions = [...input.commissions].sort(
		(a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
	);
	const commissionIds: string[] = [];
	let grossAmount = 0;
	for (const commission of sortedCommissions) {
		if (grossAmount + commission.amount > cap) break;
		commissionIds.push(commission.id);
		grossAmount += commission.amount;
	}

	const sortedCharges = [...input.charges].sort(
		(a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
	);
	const chargeIds: string[] = [];
	let offsetAmount = 0;
	for (const charge of sortedCharges) {
		if (offsetAmount + charge.amount > grossAmount) continue;
		chargeIds.push(charge.id);
		offsetAmount += charge.amount;
	}

	const amount = grossAmount - offsetAmount;
	return {
		commissionIds,
		chargeIds,
		grossAmount,
		offsetAmount,
		amount,
		fee: roundXaf(amount / 100),
		skipped:
			grossAmount === 0
				? "nothing_payable"
				: amount < input.minimum
					? "below_minimum"
					: null,
	};
}
