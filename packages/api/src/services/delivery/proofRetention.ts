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

/** P6 pushes its open-dispute guard here; the array is the interface. */
export const proofRetentionGuards: ProofRetentionGuard[] = [openContestGuard];

export async function proofsAreHeld(
	payload: Payload,
	shipment: Shipment,
): Promise<boolean> {
	for (const guard of proofRetentionGuards) {
		if (await guard(payload, shipment)) return true;
	}
	return false;
}
