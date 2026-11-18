import type { ShopShipmentView } from "../../../api/src/contracts/shipments";

/**
 * What a shop member may do to a shipment. Display-only: the transitions are
 * `SHIPMENT_TRANSITIONS` in `packages/api/src/services/delivery/shipmentTransitions.ts`
 * and the guards in `handover.ts` / `attempts.ts`; `shipmentActions.test.ts`
 * holds this table to the API's, and the routes refuse whatever slips past.
 */
export type ShipmentAction =
	| "start"
	| "ready_for_pickup"
	| "handover"
	| "attempt"
	| "declare_delivered"
	| "returned"
	| "reschedule"
	| "assign_rider"
	| "rider_link"
	| "revoke_rider_link"
	| "switch_carrier"
	| "confirm_remittance"
	| "dispute_remittance";

export type ShipmentStatus = ShopShipmentView["status"];

/** The status an action moves a shipment to, for the actions that move it. */
export const ACTION_TARGET: Partial<Record<ShipmentAction, ShipmentStatus>> = {
	start: "in_transit",
	handover: "delivered",
	attempt: "failed",
	declare_delivered: "delivered",
	returned: "returned",
};

export interface ShipmentActionContext {
	/** `orders.process` */
	canProcess: boolean;
	/** `costs.view` */
	canSeeCosts: boolean;
}

export function shipmentActions(
	view: ShopShipmentView,
	context: ShipmentActionContext,
): ShipmentAction[] {
	const out: ShipmentAction[] = [];
	const { status, carrier, method } = view;
	const own = carrier === "self";
	const outForDelivery = status === "in_transit" || status === "picked_up";
	const finalFailure = Boolean(view.finalFailure?.at);

	if (context.canProcess) {
		if (own && method !== "pickup") {
			if (status === "pending" || (status === "failed" && !finalFailure))
				out.push("start");
			if (status === "pending" || outForDelivery) out.push("assign_rider");
		}
		if (method === "pickup" && status === "pending" && !view.readyForPickupAt)
			out.push("ready_for_pickup");
		if (
			(method === "pickup" && status === "pending" && view.readyForPickupAt) ||
			(own && status === "in_transit")
		)
			out.push("handover");
		if (outForDelivery) out.push("attempt");
		if (own && status === "in_transit") out.push("declare_delivered");
		if (status === "failed" && !finalFailure && view.redelivery?.rescheduleBy)
			out.push("reschedule");
		if (status === "failed" && finalFailure) out.push("returned");
		if (own && view.rider && status !== "delivered" && isLive(status)) {
			out.push("rider_link");
			if (view.riderLink && !view.riderLink.revokedAt)
				out.push("revoke_rider_link");
		}
		if (status === "pending" && method !== "pickup") out.push("switch_carrier");
	}
	if (
		context.canSeeCosts &&
		status === "delivered" &&
		view.codCollection?.remittanceStatus === "declared_remitted"
	)
		out.push("confirm_remittance", "dispute_remittance");
	return out;
}

function isLive(status: ShipmentStatus): boolean {
	return (
		status === "pending" ||
		status === "picked_up" ||
		status === "in_transit" ||
		status === "failed"
	);
}

/**
 * What the shipment screen offers as a button. `rider_link` shares the
 * assign-rider button; `declare_delivered` is offered now that
 * `POST /api/shipments/{id}/photo` can satisfy `photoRequired`.
 */
export function visibleShipmentActions(
	view: ShopShipmentView,
	context: ShipmentActionContext,
): ShipmentAction[] {
	return shipmentActions(view, context).filter((a) => a !== "rider_link");
}

/** The links the shop's order screen shows: one per shipment, to its action screen. */
export function shopShipmentLinks(
	shipments: ReadonlyArray<Pick<ShopShipmentView, "id" | "shipmentNumber">>,
): Array<{ id: string; number: string; href: `/seller/shipment/${string}` }> {
	return shipments.map((s) => ({
		id: String(s.id),
		number: s.shipmentNumber,
		href: `/seller/shipment/${encodeURIComponent(String(s.id))}`,
	}));
}
