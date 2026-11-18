import { describe, expect, test } from "bun:test";
import type { ShopShipmentView } from "../../../api/src/contracts/shipments";
import type { Courier } from "../../../api/src/payload-types";
import {
	ATTEMPT_REASONS,
	attemptSchema,
	eligibleCouriers,
	externalRiderSchema,
	gpsLink,
	handoverCodeSchema,
	PANEL_ACTION_ROUTES,
	type PanelAction,
	panelActions,
	remittanceNeedsConfirmation,
	riderLinkState,
	shipmentDestination,
} from "./shipment-panel";
import { FAILURE_REASON_LABELS } from "./shipment-status";

type Fixture = Parameters<typeof panelActions>[0];

const shipment = (over: Partial<Fixture> = {}): Fixture => ({
	status: "pending",
	carrier: "self",
	method: "seller_delivery",
	readyForPickupAt: null,
	finalFailure: undefined,
	rider: { name: "Paul", phone: "+237670000000" },
	codCollection: undefined,
	...over,
});

const owner = { costsView: true };
const staff = { costsView: false };
const actionsOf = (over: Partial<Fixture>, context = owner) =>
	panelActions(shipment(over), context);

describe("panelActions for a shop delivery (carrier self)", () => {
	test("a pending parcel can start, get a rider, a link and a new carrier, never a code", () => {
		expect(actionsOf({ status: "pending" })).toEqual([
			"start",
			"assign_rider",
			"rider_link",
			"switch_carrier",
		]);
	});

	test("the handover code is not offered before the parcel has left", () => {
		for (const action of [
			"handover",
			"declare_delivered",
			"report_attempt",
		] as const) {
			expect(actionsOf({ status: "pending" })).not.toContain(action);
		}
	});

	test("without a rider phone there is no link to send", () => {
		expect(actionsOf({ status: "pending", rider: undefined })).toEqual([
			"start",
			"assign_rider",
			"switch_carrier",
		]);
	});

	test("on the road the shop can hand over, declare, report a failure or change the rider", () => {
		const onTheRoad: PanelAction[] = [
			"handover",
			"declare_delivered",
			"report_attempt",
			"assign_rider",
			"rider_link",
		];
		expect(actionsOf({ status: "picked_up" })).toEqual(onTheRoad);
		expect(actionsOf({ status: "in_transit" })).toEqual(onTheRoad);
	});

	test("after a missed delivery it can restart, reschedule or take the parcel back", () => {
		expect(actionsOf({ status: "failed" })).toEqual([
			"start",
			"reschedule",
			"assign_rider",
			"rider_link",
			"mark_returned",
		]);
	});

	test("once the failure is final only the return remains", () => {
		expect(
			actionsOf({
				status: "failed",
				finalFailure: { at: "2026-10-09T10:00:00.000Z", reason: "refused" },
			}),
		).toEqual(["mark_returned"]);
	});

	test("delivered, returned and cancelled parcels offer nothing without a pending remittance", () => {
		for (const status of ["delivered", "returned", "cancelled"] as const) {
			expect(actionsOf({ status })).toEqual([]);
		}
	});
});

describe("panelActions for a partner courier", () => {
	test("pending can still switch carrier; on the road the shop only watches", () => {
		expect(actionsOf({ carrier: "courier", status: "pending" })).toEqual([
			"switch_carrier",
		]);
		expect(actionsOf({ carrier: "courier", status: "in_transit" })).toEqual([]);
	});

	test("a failed partner delivery can be rescheduled or returned", () => {
		expect(actionsOf({ carrier: "courier", status: "failed" })).toEqual([
			"reschedule",
			"mark_returned",
		]);
	});
});

describe("panelActions for a pickup", () => {
	test("pending first becomes ready, then hands over with the code", () => {
		expect(actionsOf({ method: "pickup", status: "pending" })).toEqual([
			"ready_for_pickup",
		]);
		expect(
			actionsOf({
				method: "pickup",
				status: "pending",
				readyForPickupAt: "2026-10-09T10:00:00.000Z",
			}),
		).toEqual(["handover"]);
	});

	test("an uncollected parcel can be marked back at the shop", () => {
		expect(actionsOf({ method: "pickup", status: "failed" })).toEqual([
			"mark_returned",
		]);
	});
});

describe("remittance", () => {
	const declared = { remittanceStatus: "declared_remitted" as const };

	test("confirming is offered to cost viewers once the courier has declared", () => {
		expect(actionsOf({ status: "delivered", codCollection: declared })).toEqual(
			["confirm_remittance"],
		);
		expect(
			actionsOf({ status: "delivered", codCollection: declared }, staff),
		).toEqual([]);
		expect(
			actionsOf({
				status: "delivered",
				codCollection: { remittanceStatus: "pending" },
			}),
		).toEqual([]);
	});

	test("remittanceNeedsConfirmation reads the same status", () => {
		expect(remittanceNeedsConfirmation({ codCollection: declared })).toBe(true);
		expect(remittanceNeedsConfirmation({ codCollection: undefined })).toBe(
			false,
		);
	});
});

describe("every action has a route segment", () => {
	test("PANEL_ACTION_ROUTES is total over the actions the table can emit", () => {
		const emitted = new Set<PanelAction>();
		for (const status of [
			"pending",
			"picked_up",
			"in_transit",
			"failed",
			"delivered",
		] as const) {
			for (const carrier of ["self", "courier"] as const) {
				for (const method of ["seller_delivery", "pickup"] as const) {
					for (const ready of [null, "2026-10-09T10:00:00.000Z"]) {
						for (const action of panelActions(
							shipment({
								status,
								carrier,
								method,
								readyForPickupAt: ready,
								codCollection: { remittanceStatus: "declared_remitted" },
							}),
							owner,
						)) {
							emitted.add(action);
						}
					}
				}
			}
		}
		expect([...emitted].map(String).sort()).toEqual(
			Object.keys(PANEL_ACTION_ROUTES).sort(),
		);
		expect(PANEL_ACTION_ROUTES.declare_delivered).toBe("declare-delivered");
	});
});

describe("riderLinkState", () => {
	const now = new Date("2026-10-09T10:00:00.000Z");
	const link = (over: Partial<NonNullable<ShopShipmentView["riderLink"]>>) => ({
		createdAt: "2026-10-08T10:00:00.000Z",
		expiresAt: "2026-10-11T10:00:00.000Z",
		revokedAt: null,
		lastUsedAt: null,
		...over,
	});

	test("reads none, active, expired and revoked", () => {
		expect(riderLinkState(null, now)).toBe("none");
		expect(riderLinkState(link({}), now)).toBe("active");
		expect(
			riderLinkState(link({ expiresAt: "2026-10-09T10:00:00.000Z" }), now),
		).toBe("expired");
		expect(
			riderLinkState(link({ revokedAt: "2026-10-09T09:00:00.000Z" }), now),
		).toBe("revoked");
	});
});

describe("forms", () => {
	test("the handover code is exactly four digits", () => {
		expect(handoverCodeSchema.safeParse({ code: "1234" }).success).toBe(true);
		for (const code of ["123", "12345", "12a4", ""]) {
			expect(handoverCodeSchema.safeParse({ code }).success).toBe(false);
		}
	});

	test("an external rider needs a name and an E.164 phone", () => {
		expect(
			externalRiderSchema.safeParse({ name: "Paul", phone: "+237670000000" })
				.success,
		).toBe(true);
		expect(
			externalRiderSchema.safeParse({ name: "", phone: "+237670000000" })
				.success,
		).toBe(false);
		expect(
			externalRiderSchema.safeParse({ name: "Paul", phone: "670000000" })
				.success,
		).toBe(false);
	});

	test("the attempt reasons are exactly the vocabulary map's eight", () => {
		expect([...ATTEMPT_REASONS].map(String).sort()).toEqual(
			Object.keys(FAILURE_REASON_LABELS).sort(),
		);
		expect(
			attemptSchema.safeParse({ reason: "absent", note: "" }).success,
		).toBe(true);
		expect(attemptSchema.safeParse({ reason: "lost", note: "" }).success).toBe(
			false,
		);
		expect(
			attemptSchema.safeParse({ reason: "absent", note: "x".repeat(301) })
				.success,
		).toBe(false);
	});
});

describe("gpsLink", () => {
	test("links a recorded point and nothing else", () => {
		expect(gpsLink({ lat: 4.05, lng: 9.7 })).toBe(
			"https://www.google.com/maps/search/?api=1&query=4.05,9.7",
		);
		expect(gpsLink({ lat: 4.05 })).toBeNull();
		expect(gpsLink(undefined)).toBeNull();
	});
});

describe("shipmentDestination", () => {
	test("reads the snapshot's keys and ignores what is not a string or a point", () => {
		expect(
			shipmentDestination({
				destination: {
					recipientName: "Aicha Ngu",
					phone: "+237600000002",
					city: "douala",
					district: "douala.akwa",
					landmark: "",
					gps: { lat: 4.05, lng: "x" },
				},
			}),
		).toEqual({
			recipientName: "Aicha Ngu",
			phone: "+237600000002",
			city: "douala",
			district: "douala.akwa",
			landmark: null,
			gps: null,
		});
		expect(shipmentDestination({ destination: null }).city).toBeNull();
	});
});

describe("eligibleCouriers", () => {
	const courier = (over: Partial<Courier>): Courier => ({
		id: "c1",
		key: "fastgo",
		name: "FastGo",
		provider: "manual",
		scopes: ["same_city"],
		cities: ["douala"],
		status: "active",
		billingMode: "shop_account",
		supportsCod: false,
		tariffs: [
			{ city: "douala", amount: 2500, etaMinHours: 24, etaMaxHours: 48 },
		],
		updatedAt: "2026-10-01T00:00:00.000Z",
		createdAt: "2026-10-01T00:00:00.000Z",
		...over,
	});
	const where = { city: "douala", district: "douala.akwa" };

	test("lists couriers serving the city with the tariff they would quote", () => {
		const choices = eligibleCouriers([courier({})], where, false);
		expect(choices.map((c) => [c.courier.id, c.tariff?.amount])).toEqual([
			["c1", 2500],
		]);
	});

	test("a cash-on-delivery parcel only gets couriers that take cash", () => {
		const list = [
			courier({ id: "no" }),
			courier({ id: "yes", supportsCod: true }),
		];
		expect(
			eligibleCouriers(list, where, true).map((c) => c.courier.id),
		).toEqual(["yes"]);
		expect(
			eligibleCouriers(list, where, false).map((c) => c.courier.id),
		).toEqual(["no", "yes"]);
	});

	test("a courier outside the parcel's city is not offered", () => {
		expect(
			eligibleCouriers([courier({ cities: ["yaounde"] })], where, false),
		).toEqual([]);
	});
});
