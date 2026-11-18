import { describe, expect, test } from "bun:test";
import type { CourierShipmentView } from "../../../api/src/contracts/shipments";
import { SHIPMENT_STATUSES } from "../../../api/src/lib/delivery/types";
import {
	courierSpaceTarget,
	destinationMapsUrl,
	groupRiderRows,
	type RiderApiAction,
	readDestination,
	riderButton,
	riderButtons,
	riderGroup,
} from "./riderShipment";

const ALL: RiderApiAction[] = [
	"picked_up",
	"in_transit",
	"attempt",
	"handover",
	"returned",
];

describe("riderButton", () => {
	test("is total over the API's actions and only ever offers the pick-up run", () => {
		expect(ALL.map(riderButton)).toEqual([
			"pick_up",
			"pick_up",
			null,
			null,
			null,
		]);
	});

	test("collapses the two pick-up actions into one button and never declares delivery", () => {
		expect(riderButtons(["picked_up", "in_transit", "handover"])).toEqual([
			"pick_up",
		]);
		expect(riderButtons([])).toEqual([]);
		expect(riderButtons(ALL).map(String)).not.toContain("declare_delivered");
	});
});

describe("riderGroup", () => {
	test("places every shipment status in a group", () => {
		expect(
			SHIPMENT_STATUSES.map((status) => [status, riderGroup(status)]),
		).toEqual([
			["pending", "today"],
			["picked_up", "today"],
			["in_transit", "today"],
			["delivered", "done"],
			["failed", "retake"],
			["returned", "done"],
			["cancelled", "done"],
		]);
	});

	test("groupRiderRows keeps the Today, To retake, Done order and drops empty groups", () => {
		const rows = [
			{ id: "a", status: "delivered" as const },
			{ id: "b", status: "in_transit" as const },
			{ id: "c", status: "pending" as const },
		];
		expect(
			groupRiderRows(rows).map((s) => [s.group, s.rows.map((r) => r.id)]),
		).toEqual([
			["today", ["b", "c"]],
			["done", ["a"]],
		]);
	});
});

describe("destinationMapsUrl", () => {
	const base: CourierShipmentView["destination"] = {
		recipientFirstName: "A",
		phone: null,
		city: "douala",
		district: "douala.akwa",
		landmark: "Pharmacie",
		gps: null,
	};
	test("prefers the pin, falls back to the landmark and city", () => {
		expect(destinationMapsUrl({ ...base, gps: { lat: 4.05, lng: 9.7 } })).toBe(
			"https://www.google.com/maps/search/?api=1&query=4.05%2C9.7",
		);
		expect(destinationMapsUrl(base)).toContain("Pharmacie");
	});
});

describe("readDestination", () => {
	test("reads the stored JSON defensively", () => {
		expect(
			readDestination({
				city: "douala",
				landmark: "Pharmacie",
				gps: { lat: 4.05, lng: 9.7 },
				phone: "+237600000000",
				recipientFirstName: "Awa",
			}),
		).toEqual({
			city: "douala",
			district: null,
			landmark: "Pharmacie",
			recipientName: "Awa",
			phone: "+237600000000",
			gps: { lat: 4.05, lng: 9.7 },
		});
		expect(readDestination("garbage").gps).toBeNull();
		expect(readDestination({ gps: { lat: "x", lng: 1 } }).gps).toBeNull();
	});
});

describe("courierSpaceTarget", () => {
	test("sends dispatchers to the dispatcher list, riders to theirs, others nowhere", () => {
		expect(
			courierSpaceTarget([
				{ role: "rider", status: "active" },
				{ role: "dispatcher", status: "active" },
			]),
		).toBe("/courier");
		expect(courierSpaceTarget([{ role: "rider", status: "active" }])).toBe(
			"/rider",
		);
		expect(
			courierSpaceTarget([{ role: "dispatcher", status: "revoked" }]),
		).toBeNull();
		expect(courierSpaceTarget([])).toBeNull();
	});
});
