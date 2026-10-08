import type { Payload, TaskConfig } from "payload";
import type { Shipment } from "../payload-types";
import {
	PROOF_RETENTION_DAYS,
	proofsAreHeld,
} from "../services/delivery/proofRetention";
import { SHIPMENT_SERVICE_CONTEXT } from "../services/delivery/shipmentTransitions";
import { DAY_MS, forEachShipment } from "./deliverySupport";

function terminalAt(shipment: Shipment): string | null | undefined {
	switch (shipment.status) {
		case "delivered":
			return shipment.deliveredAt;
		case "returned":
			return shipment.returnedAt;
		case "cancelled":
			return shipment.cancelledAt;
		default:
			return null;
	}
}

export async function purgeDeliveryProofs(
	payload: Payload,
	now: Date = new Date(),
): Promise<{ shipments: string[]; proofsDeleted: number }> {
	const cutoff = new Date(now.getTime() - PROOF_RETENTION_DAYS * DAY_MS);
	const cutoffIso = cutoff.toISOString();
	let proofsDeleted = 0;
	const shipments = await forEachShipment(
		payload,
		{
			or: [
				{
					and: [
						{ status: { equals: "delivered" } },
						{ deliveredAt: { less_than_equal: cutoffIso } },
					],
				},
				{
					and: [
						{ status: { equals: "returned" } },
						{ returnedAt: { less_than_equal: cutoffIso } },
					],
				},
				{
					and: [
						{ status: { equals: "cancelled" } },
						{ cancelledAt: { less_than_equal: cutoffIso } },
					],
				},
			],
		},
		"purgeDeliveryProofs",
		async (req, shipment) => {
			const at = terminalAt(shipment);
			if (!at || Date.parse(at) > cutoff.getTime()) return null;
			const proofs = await req.payload.find({
				collection: "delivery-proofs",
				where: { shipment: { equals: String(shipment.id) } },
				depth: 0,
				limit: 0,
				pagination: false,
				overrideAccess: true,
				req,
			});
			if (proofs.docs.length === 0) return null;
			if (await proofsAreHeld(req.payload, shipment)) return null;
			for (const proof of proofs.docs) {
				await req.payload.delete({
					collection: "delivery-proofs",
					id: String(proof.id),
					req,
					overrideAccess: true,
				});
			}
			await req.payload.update({
				collection: "shipments",
				id: String(shipment.id),
				req,
				overrideAccess: true,
				context: SHIPMENT_SERVICE_CONTEXT,
				data: {
					proof: { ...shipment.proof, photo: null },
					attempts: (shipment.attempts ?? []).map((attempt) => ({
						...attempt,
						photo: null,
					})),
				},
			});
			proofsDeleted += proofs.docs.length;
			return String(shipment.id);
		},
	);
	return { shipments, proofsDeleted };
}

export const purgeDeliveryProofsTask: TaskConfig<{
	input: object;
	output: { shipmentCount: number; proofsDeleted: number };
}> = {
	slug: "purgeDeliveryProofs",
	retries: 1,
	inputSchema: [],
	handler: async ({ req }) => {
		const { shipments, proofsDeleted } = await purgeDeliveryProofs(req.payload);
		return { output: { shipmentCount: shipments.length, proofsDeleted } };
	},
};
