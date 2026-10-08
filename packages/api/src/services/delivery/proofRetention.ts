import type { Payload } from "payload";
import { relationId } from "../../lib/relationId";
import type { Shipment } from "../../payload-types";

export const PROOF_RETENTION_DAYS = 180;

/** Answers true when the shipment's proofs must be kept. */
export type ProofRetentionGuard = (
	payload: Payload,
	shipment: Shipment,
) => Promise<boolean>;

const openContestGuard: ProofRetentionGuard = async (payload, shipment) => {
	const orderId = relationId(shipment.order);
	if (!orderId) return false;
	const order = await payload.findByID({
		collection: "orders",
		id: orderId,
		depth: 0,
		overrideAccess: true,
	});
	const contestBy = order.handover?.contestBy;
	return Boolean(contestBy) && Date.parse(String(contestBy)) > Date.now();
};

const OPEN_DISPUTE_STATUSES = [
	"open",
	"awaiting_seller",
	"awaiting_buyer",
	"under_review",
];
const CLOSED_RETURN_STATUSES = [
	"rejected",
	"cancelled",
	"refunded",
	"closed",
	"expired",
];

/** An open dispute, an open return case or a legal hold on the order's cases keeps the proofs. */
const openCaseGuard: ProofRetentionGuard = async (payload, shipment) => {
	const orderId = relationId(shipment.order);
	if (!orderId) return false;
	const disputes = await payload.find({
		collection: "disputes",
		where: {
			and: [
				{ order: { equals: orderId } },
				{
					or: [
						{ status: { in: OPEN_DISPUTE_STATUSES } },
						{ legalHold: { equals: true } },
					],
				},
			],
		},
		depth: 0,
		limit: 1,
		pagination: false,
		overrideAccess: true,
	});
	if (disputes.docs.length > 0) return true;
	const cases = await payload.find({
		collection: "return-cases",
		where: {
			and: [
				{ order: { equals: orderId } },
				{ status: { not_in: CLOSED_RETURN_STATUSES } },
			],
		},
		depth: 0,
		limit: 1,
		pagination: false,
		overrideAccess: true,
	});
	return cases.docs.length > 0;
};

/** Each phase pushes its guard here; the array is the interface. */
export const proofRetentionGuards: ProofRetentionGuard[] = [
	openContestGuard,
	openCaseGuard,
];

export async function proofsAreHeld(
	payload: Payload,
	shipment: Shipment,
): Promise<boolean> {
	for (const guard of proofRetentionGuards) {
		if (await guard(payload, shipment)) return true;
	}
	return false;
}
