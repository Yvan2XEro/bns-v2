import type { Payload } from "payload";
import type { AppSetting } from "../payload-types";
import type { TxReq } from "./transactions";

export interface ResaleSettings {
	enabled: boolean;
	prepaidEnabled: boolean;
	poAcceptHours: number;
	newResellerWeeklyCap: number;
	minPayout: number;
	payoutApprovalAbove: number;
}

export const DEFAULT_RESALE_SETTINGS: ResaleSettings = {
	enabled: false,
	prepaidEnabled: false,
	poAcceptHours: 24,
	newResellerWeeklyCap: 25_000,
	minPayout: 2_000,
	payoutApprovalAbove: 500_000,
};

const CLOSED_RESALE_SETTINGS: ResaleSettings = {
	...DEFAULT_RESALE_SETTINGS,
	enabled: false,
	prepaidEnabled: false,
};

type RecordValue = Record<string, unknown>;

function recordOf(value: unknown): RecordValue {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as RecordValue)
		: {};
}

function relationId(value: unknown): string | null {
	if (typeof value === "string" && value.trim()) return value;
	const id = recordOf(value).id;
	if (typeof id === "string" && id.trim()) return id;
	if (typeof id === "number" && Number.isSafeInteger(id)) return String(id);
	return null;
}

function integerSetting(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
		? value
		: fallback;
}

export function hasNotchPayAffiliateEvidence(value: unknown): boolean {
	if (!Array.isArray(value)) return false;
	return value.some((raw) => {
		const row = recordOf(raw);
		return (
			row.gate === "notchpay_affiliate" && relationId(row.evidence) !== null
		);
	});
}

export function resalePrepaidRefusal(
	resaleValue: unknown,
	paymentsValue: unknown,
): string | null {
	const resale = recordOf(resaleValue);
	if (resale.prepaidEnabled !== true) return null;
	const payments = recordOf(paymentsValue);
	if (recordOf(payments.protectedPayment).enabled !== true) {
		return "resale.prepaidEnabled requires payments.protectedPayment.enabled.";
	}
	if (!hasNotchPayAffiliateEvidence(resale.gates)) {
		return "resale.prepaidEnabled requires a filed notchpay_affiliate gate with evidence.";
	}
	return null;
}

export async function getResaleSettings(
	payload: Payload,
	req?: TxReq,
): Promise<ResaleSettings> {
	try {
		const settings: AppSetting = await payload.findGlobal({
			slug: "app-settings",
			depth: 0,
			overrideAccess: true,
			req,
		});
		const resale = settings.resale;
		const payments = settings.payments;
		const prepaidRefusal = resalePrepaidRefusal(resale, payments);
		return {
			enabled: resale?.enabled === true,
			prepaidEnabled:
				resale?.prepaidEnabled === true && prepaidRefusal === null,
			poAcceptHours: integerSetting(
				resale?.poAcceptHours,
				DEFAULT_RESALE_SETTINGS.poAcceptHours,
			),
			newResellerWeeklyCap: integerSetting(
				resale?.newResellerWeeklyCap,
				DEFAULT_RESALE_SETTINGS.newResellerWeeklyCap,
			),
			minPayout: integerSetting(
				resale?.minPayout,
				DEFAULT_RESALE_SETTINGS.minPayout,
			),
			payoutApprovalAbove: integerSetting(
				resale?.payoutApprovalAbove,
				DEFAULT_RESALE_SETTINGS.payoutApprovalAbove,
			),
		};
	} catch {
		return { ...CLOSED_RESALE_SETTINGS };
	}
}
