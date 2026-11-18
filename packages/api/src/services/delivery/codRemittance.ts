import type { PayloadRequest } from "payload";
import type { OrderViewer } from "../../access/orderAccess";
import { can, resolveShopRole } from "../../access/shopRoles";
import { ERROR_CODES } from "../../lib/errors";
import { relationId } from "../../lib/relationId";
import { ServiceError } from "../../lib/serviceError";
import type { Shipment } from "../../payload-types";
import {
	appendShipmentEvent,
	SHIPMENT_SERVICE_CONTEXT,
} from "./shipmentTransitions";

export async function confirmShipmentRemittance(
	req: PayloadRequest,
	shipment: Shipment,
	actor: OrderViewer,
	action: "confirm" | "dispute",
	note?: string,
): Promise<Shipment> {
	const shopId =
		relationId(shipment.fulfillingShop) ?? relationId(shipment.storefrontShop);
	const role = await resolveShopRole(
		req.payload,
		actor.id,
		shopId,
		req.context,
	);
	if (!role || !can(role, "costs.view")) {
		throw new ServiceError(ERROR_CODES.shopForbidden, 403);
	}
	if (
		shipment.status !== "delivered" ||
		shipment.codCollection?.remittanceStatus !== "declared_remitted"
	) {
		throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
	}
	const now = new Date().toISOString();
	const remittanceStatus = action === "confirm" ? "confirmed" : "disputed";
	const updated = await req.payload.update({
		collection: "shipments",
		id: String(shipment.id),
		req,
		overrideAccess: true,
		context: SHIPMENT_SERVICE_CONTEXT,
		data: {
			codCollection: {
				...shipment.codCollection,
				remittanceStatus,
				...(action === "confirm" ? { confirmedAt: now } : {}),
				...(note?.trim() ? { note: note.trim() } : {}),
			},
			...(action === "dispute"
				? {
						flags: [
							...new Set([
								...(shipment.flags ?? []),
								"cod_remittance_disputed" as const,
							]),
						],
					}
				: {}),
		},
	});
	if (action === "dispute") {
		await req.payload.create({
			collection: "reports",
			req,
			overrideAccess: true,
			data: {
				reporter: actor.id,
				targetType: "shipment",
				targetId: String(shipment.id),
				reason: "cod_remittance",
				...(note?.trim() ? { description: note.trim() } : {}),
				status: "pending",
			},
		});
	}
	await appendShipmentEvent(req, updated, {
		type:
			action === "confirm"
				? "shipment.cod_remittance_confirmed"
				: "shipment.cod_remittance_disputed",
		actorType: "seller",
		actor: actor.id,
		visibility: "both",
		occurredAt: now,
		...(note?.trim() ? { metadata: { reason: note.trim() } } : {}),
	});
	return updated;
}
