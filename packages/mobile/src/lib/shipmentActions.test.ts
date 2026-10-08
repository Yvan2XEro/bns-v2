import { describe, expect, test } from "bun:test";
import type { ShopShipmentView } from "../../../api/src/contracts/shipments";
import { SHIPMENT_STATUSES } from "../../../api/src/lib/delivery/types";
import { SHIPMENT_TRANSITIONS } from "../../../api/src/services/delivery/shipmentTransitions";
import {
	ACTION_TARGET,
	type ShipmentAction,
	shipmentActions,
	shopShipmentLinks,
	visibleShipmentActions,
} from "./shipmentActions";

const view = (patch: Partial<ShopShipmentView>): ShopShipmentView =>
	({
		id: "s1",
		status: "pending",
		carrier: "self",
		method: "seller_delivery",
		...patch,
	}) as ShopShipmentView;
const full = { canProcess: true, canSeeCosts: true };
const actions = (patch: Partial<ShopShipmentView>) =>
	shipmentActions(view(patch), full);

describe("shipmentActions per status and carrier", () => {
	test("a pending own delivery starts, assigns a rider or switches carrier", () => {
		expect(actions({})).toEqual(["start", "assign_rider", "switch_carrier"]);
	});

	test("an own delivery on the road can be handed over, declared, failed or given a rider link", () => {
		const out = actions({
			status: "in_transit",
			rider: { name: "Paul", phone: "+237600000000" },
		});
		expect(out).toEqual([
			"assign_rider",
			"handover",
			"attempt",
			"declare_delivered",
			"rider_link",
		]);
	});

	test("a revoked or absent rider link offers no revoke; a live one does", () => {
		const rider = { name: "Paul", phone: "+237600000000" };
		expect(
			actions({
				status: "in_transit",
				rider,
				riderLink: { revokedAt: "2026-10-01T00:00:00Z" },
			}),
		).not.toContain("revoke_rider_link");
		expect(
			actions({
				status: "in_transit",
				rider,
				riderLink: { createdAt: "2026-10-01T00:00:00Z" },
			}),
		).toContain("revoke_rider_link");
	});

	test("a partner courier shipment never offers the seller's own-delivery actions", () => {
		const out = actions({ carrier: "courier", status: "in_transit" });
		expect(out).toEqual(["attempt"]);
		expect(out).not.toContain("declare_delivered");
		expect(out).not.toContain("start");
		expect(out).not.toContain("handover");
	});

	test("a pickup parcel is ready, then handed over with the code", () => {
		expect(actions({ method: "pickup" })).toEqual(["ready_for_pickup"]);
		expect(
			actions({ method: "pickup", readyForPickupAt: "2026-10-01T00:00:00Z" }),
		).toEqual(["handover"]);
	});

	test("a failed parcel with time left restarts or reschedules; a final failure comes back", () => {
		expect(
			actions({
				status: "failed",
				redelivery: { rescheduleBy: "2026-10-09T00:00:00Z" },
			}),
		).toEqual(["start", "reschedule"]);
		expect(
			actions({
				status: "failed",
				finalFailure: { at: "2026-10-09T00:00:00Z" },
			}),
		).toEqual(["returned"]);
	});

	test("terminal statuses offer nothing but the remittance answer", () => {
		for (const status of ["returned", "cancelled"] as const)
			expect(actions({ status })).toEqual([]);
		expect(actions({ status: "delivered" })).toEqual([]);
		expect(
			actions({
				status: "delivered",
				codCollection: { remittanceStatus: "declared_remitted" },
			}),
		).toEqual(["confirm_remittance", "dispute_remittance"]);
	});

	test("roles: no processing right, no actions; no cost right, no remittance answer", () => {
		expect(
			shipmentActions(view({}), { canProcess: false, canSeeCosts: false }),
		).toEqual([]);
		expect(
			shipmentActions(
				view({
					status: "delivered",
					codCollection: { remittanceStatus: "declared_remitted" },
				}),
				{ canProcess: true, canSeeCosts: false },
			),
		).toEqual([]);
	});
});

describe("the action set mirrors the API's transition table", () => {
	const carriers = ["self", "courier"] as const;
	const methods = ["seller_delivery", "courier", "pickup"] as const;
	test("every offered action that moves a shipment targets a status the API allows from there", () => {
		let checked = 0;
		for (const status of SHIPMENT_STATUSES)
			for (const carrier of carriers)
				for (const method of methods)
					for (const finalAt of [null, "2026-10-09T00:00:00Z"])
						for (const ready of [null, "2026-10-01T00:00:00Z"]) {
							const offered = actions({
								status,
								carrier,
								method,
								readyForPickupAt: ready,
								finalFailure: finalAt ? { at: finalAt } : {},
								redelivery: { rescheduleBy: "2026-10-09T00:00:00Z" },
							});
							for (const action of offered) {
								const target = ACTION_TARGET[action as ShipmentAction];
								if (!target) continue;
								checked += 1;
								expect(SHIPMENT_TRANSITIONS[status]).toContain(target);
							}
						}
		expect(checked).toBeGreaterThan(20);
	});
});

describe("visibleShipmentActions", () => {
	test("offers declare-delivered on an own delivery on the road and folds the rider link into assign", () => {
		const out = visibleShipmentActions(
			view({
				status: "in_transit",
				rider: { name: "Paul", phone: "+237600000000" },
			}),
			full,
		);
		expect(out).toEqual([
			"assign_rider",
			"handover",
			"attempt",
			"declare_delivered",
		]);
	});
});

describe("shopShipmentLinks", () => {
	test("one link per shipment to the seller shipment screen", () => {
		expect(
			shopShipmentLinks([
				{ id: "s1", shipmentNumber: "SHP-1" },
				{ id: "s/2", shipmentNumber: "SHP-2" },
			]),
		).toEqual([
			{ id: "s1", number: "SHP-1", href: "/seller/shipment/s1" },
			{ id: "s/2", number: "SHP-2", href: "/seller/shipment/s%2F2" },
		]);
		expect(shopShipmentLinks([])).toEqual([]);
	});
});
