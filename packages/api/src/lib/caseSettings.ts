import type { Payload } from "payload";
import type { AppSetting } from "../payload-types";
import { isRecord } from "./payments/types";
import { relationId } from "./relationId";

/**
 * Shared by `returns.*` (the G1 minimum-days check) and `disputes.*` (G2/G3
 * to enable, G4 for strike effects and the seller loss fee). One gate record
 * lives under `disputes.gates`; there is no separate returns gate array.
 */
export const CASE_GATE_IDS = ["G1", "G2", "G3", "G4"] as const;
type PresentFields<T> = { [K in keyof T]-?: NonNullable<T[K]> };
type StoredDisputes = NonNullable<AppSetting["disputes"]>;
type StoredGate = NonNullable<StoredDisputes["gates"]>[number];
export type CaseGateId = StoredGate["gate"];
export type CaseGateRow = Pick<StoredGate, "gate"> & {
	[K in "clearedAt" | "clearedBy" | "note"]-?: NonNullable<
		StoredGate[K]
	> | null;
} & { evidence: string | null };
export type ReturnSettings = PresentFields<NonNullable<AppSetting["returns"]>>;
export type EvidenceLimit = PresentFields<
	NonNullable<StoredDisputes["evidenceLimit"]>
>;
export type DisputeSettings = Omit<
	PresentFields<StoredDisputes>,
	"gates" | "evidenceLimit"
> & {
	evidenceLimit: EvidenceLimit;
	gates: CaseGateRow[];
};

/** The spec's legal minimums, not features: there is no enable switch. */
export const RETURN_DEFAULTS: ReturnSettings = {
	shipByDays: 15,
	nonConformityShipByDays: 7,
	sellerPickupDays: 5,
	inspectDays: 3,
	receivePresumptionDays: 7,
	refundDays: 15,
	codRefundConfirmSilenceDays: 7,
	lateDeliveryGraceDays: 7,
	returnWaiverMaxGoodsValue: 10_000,
	refundOutboundDeliveryOnWithdrawal: true,
	maxReturnShippingReimbursement: 5000,
};

export const DISPUTE_DEFAULTS: DisputeSettings = {
	enabled: false,
	submitAutoHours: 24,
	respondHours: 72,
	reminderHours: 48,
	proposalHours: 72,
	maxProposalRounds: 3,
	reviewBusinessDays: 5,
	maxInfoRequests: 2,
	moderatorRefundLimit: 250_000,
	notReceivedMaxDays: 60,
	conformityWindowDays: 15,
	counterfeitWindowDays: 60,
	noShowWindowDays: 7,
	evidenceRetentionDays: 1095,
	evidenceLimit: { perParty: 10, total: 30 },
	strikeEffectsEnabled: false,
	sellerLossFee: 0,
	gates: [],
};

type Rec = Record<string, unknown>;
const recordOf = (value: unknown): Rec =>
	isRecord(value) && !Array.isArray(value) ? value : {};

const intOr = (value: unknown, fallback: number): number => {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
		? value
		: fallback;
};

const boolOr = (value: unknown, fallback: boolean): boolean =>
	typeof value === "boolean" ? value : fallback;

const textOrNull = (value: unknown): string | null =>
	typeof value === "string" && value.trim() ? value : null;

export function caseGatesOf(value: unknown): CaseGateRow[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((raw) => {
		const row = recordOf(raw);
		const gate = CASE_GATE_IDS.find((id) => id === row.gate);
		if (!gate) return [];
		return [
			{
				gate,
				clearedAt: textOrNull(row.clearedAt),
				clearedBy: textOrNull(row.clearedBy),
				evidence: relationId(row.evidence),
				note: textOrNull(row.note),
			},
		];
	});
}

/** Normalises a raw `returns` group the way every reader must see it. */
export function returnSettingsOf(returns: unknown): ReturnSettings {
	const r = recordOf(returns);
	const d = RETURN_DEFAULTS;
	return {
		shipByDays: intOr(r.shipByDays, d.shipByDays),
		nonConformityShipByDays: intOr(
			r.nonConformityShipByDays,
			d.nonConformityShipByDays,
		),
		sellerPickupDays: intOr(r.sellerPickupDays, d.sellerPickupDays),
		inspectDays: intOr(r.inspectDays, d.inspectDays),
		receivePresumptionDays: intOr(
			r.receivePresumptionDays,
			d.receivePresumptionDays,
		),
		refundDays: intOr(r.refundDays, d.refundDays),
		codRefundConfirmSilenceDays: intOr(
			r.codRefundConfirmSilenceDays,
			d.codRefundConfirmSilenceDays,
		),
		lateDeliveryGraceDays: intOr(
			r.lateDeliveryGraceDays,
			d.lateDeliveryGraceDays,
		),
		returnWaiverMaxGoodsValue: intOr(
			r.returnWaiverMaxGoodsValue,
			d.returnWaiverMaxGoodsValue,
		),
		refundOutboundDeliveryOnWithdrawal: boolOr(
			r.refundOutboundDeliveryOnWithdrawal,
			d.refundOutboundDeliveryOnWithdrawal,
		),
		maxReturnShippingReimbursement: intOr(
			r.maxReturnShippingReimbursement,
			d.maxReturnShippingReimbursement,
		),
	};
}

function evidenceLimitOf(value: unknown): EvidenceLimit {
	const row = recordOf(value);
	const d = DISPUTE_DEFAULTS.evidenceLimit;
	return {
		perParty: intOr(row.perParty, d.perParty),
		total: intOr(row.total, d.total),
	};
}

/** Normalises a raw `disputes` group the way every reader must see it. */
export function disputeSettingsOf(disputes: unknown): DisputeSettings {
	const p = recordOf(disputes);
	const d = DISPUTE_DEFAULTS;
	return {
		enabled: boolOr(p.enabled, d.enabled),
		submitAutoHours: intOr(p.submitAutoHours, d.submitAutoHours),
		respondHours: intOr(p.respondHours, d.respondHours),
		reminderHours: intOr(p.reminderHours, d.reminderHours),
		proposalHours: intOr(p.proposalHours, d.proposalHours),
		maxProposalRounds: intOr(p.maxProposalRounds, d.maxProposalRounds),
		reviewBusinessDays: intOr(p.reviewBusinessDays, d.reviewBusinessDays),
		maxInfoRequests: intOr(p.maxInfoRequests, d.maxInfoRequests),
		moderatorRefundLimit: intOr(p.moderatorRefundLimit, d.moderatorRefundLimit),
		notReceivedMaxDays: intOr(p.notReceivedMaxDays, d.notReceivedMaxDays),
		conformityWindowDays: intOr(p.conformityWindowDays, d.conformityWindowDays),
		counterfeitWindowDays: intOr(
			p.counterfeitWindowDays,
			d.counterfeitWindowDays,
		),
		noShowWindowDays: intOr(p.noShowWindowDays, d.noShowWindowDays),
		evidenceRetentionDays: intOr(
			p.evidenceRetentionDays,
			d.evidenceRetentionDays,
		),
		evidenceLimit: evidenceLimitOf(p.evidenceLimit),
		strikeEffectsEnabled: boolOr(
			p.strikeEffectsEnabled,
			d.strikeEffectsEnabled,
		),
		sellerLossFee: intOr(p.sellerLossFee, d.sellerLossFee),
		gates: caseGatesOf(p.gates),
	};
}

/** Fails closed: an unreadable global means the spec's legal minimums. */
export async function getReturnSettings(
	payload: Payload,
): Promise<ReturnSettings> {
	try {
		const global = await payload.findGlobal({
			slug: "app-settings",
			depth: 0,
			overrideAccess: true,
		});
		return returnSettingsOf(global.returns);
	} catch {
		return { ...RETURN_DEFAULTS };
	}
}

/** Fails closed: an unreadable global means disputes stay off. */
export async function getDisputeSettings(
	payload: Payload,
): Promise<DisputeSettings> {
	try {
		const global = await payload.findGlobal({
			slug: "app-settings",
			depth: 0,
			overrideAccess: true,
		});
		return disputeSettingsOf(global.disputes);
	} catch {
		return disputeSettingsOf(undefined);
	}
}

export function filedCaseGates(gates: readonly CaseGateRow[]): Set<CaseGateId> {
	return new Set(gates.filter((g) => g.evidence !== null).map((g) => g.gate));
}

export function hasWithdrawalExclusionApproval(
	gates: readonly CaseGateRow[],
): boolean {
	return gates.some(
		(gate) =>
			gate.gate === "G1" && gate.evidence !== null && gate.note !== null,
	);
}

/**
 * Whether disputes are open right now. Re-checks G2 and G3 on every read, so
 * a gate row deleted after the flag was saved closes the feature at once —
 * the same re-check `isProtectedPaymentOpen` does for payments.
 */
export function isDisputesOpen(settings: DisputeSettings): boolean {
	if (!settings.enabled) return false;
	const filed = filedCaseGates(settings.gates);
	return filed.has("G2") && filed.has("G3");
}
