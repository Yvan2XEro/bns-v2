import { describe, expect, test } from "bun:test";
import type { CourierShipmentRow } from "../../../api/src/contracts/shipments";
import type { CourierMember } from "../../../api/src/payload-types";
import {
	COURIER_TABS,
	courierRowActions,
	dispatcherCourierIds,
	riderOptions,
	rowSummary,
	tabStatus,
} from "./courier-space";

const row = (over: Partial<CourierShipmentRow> = {}): CourierShipmentRow => ({
	id: "s1",
	shipmentNumber: "SHP-1",
	status: "pending",
	courierId: "c1",
	origin: {},
	destination: {
		recipientName: "Aicha Nguema",
		phone: "+237600000002",
		city: "douala",
		district: "douala.akwa",
		landmark: "Rue 1",
	},
	codCollection: null,
	rider: null,
	...over,
});

const member = (over: Partial<CourierMember>): CourierMember => ({
	id: "m1",
	courier: "c1",
	user: "u1",
	role: "rider",
	status: "active",
	phoneSharingConsentAt: "2026-10-01T00:00:00.000Z",
	updatedAt: "2026-10-01T00:00:00.000Z",
	createdAt: "2026-10-01T00:00:00.000Z",
	...over,
});

describe("tabs", () => {
	test("all sends no status filter, every other tab its own status", () => {
		expect(tabStatus("all")).toBeUndefined();
		for (const tab of COURIER_TABS.filter((t) => t !== "all")) {
			expect(tabStatus(tab)).toBe(tab);
		}
	});
});

describe("courierRowActions", () => {
	const dispatcher = new Set(["c1"]);

	test("a dispatcher can assign a rider on every live status and not on a finished one", () => {
		for (const status of [
			"pending",
			"picked_up",
			"in_transit",
			"failed",
		] as const) {
			expect(courierRowActions(row({ status }), dispatcher)).toEqual([
				"assign_rider",
			]);
		}
		for (const status of ["delivered", "returned", "cancelled"] as const) {
			expect(courierRowActions(row({ status }), dispatcher)).toEqual([]);
		}
	});

	test("a pending remittance can be declared", () => {
		expect(
			courierRowActions(
				row({
					status: "delivered",
					codCollection: { remittanceStatus: "pending" },
				}),
				dispatcher,
			),
		).toEqual(["declare_remittance"]);
		expect(
			courierRowActions(
				row({
					status: "delivered",
					codCollection: { remittanceStatus: "declared_remitted" },
				}),
				dispatcher,
			),
		).toEqual([]);
	});

	test("a rider, or a dispatcher of another courier, gets no action", () => {
		expect(courierRowActions(row(), new Set())).toEqual([]);
		expect(courierRowActions(row({ courierId: "c2" }), dispatcher)).toEqual([]);
		expect(courierRowActions(row({ courierId: null }), dispatcher)).toEqual([]);
	});
});

describe("memberships", () => {
	test("dispatcherCourierIds keeps active dispatcher rows only", () => {
		const ids = dispatcherCourierIds([
			member({ role: "dispatcher", courier: "c1" }),
			member({
				id: "m2",
				role: "dispatcher",
				courier: "c2",
				status: "revoked",
			}),
			member({ id: "m3", role: "rider", courier: "c3" }),
		]);
		expect([...ids]).toEqual(["c1"]);
	});

	test("riderOptions lists the courier's active riders and marks the ones who have not consented", () => {
		const options = riderOptions(
			[
				member({ user: { id: "u1", name: "Paul" } as CourierMember["user"] }),
				member({ id: "m2", user: "u2", phoneSharingConsentAt: null }),
				member({ id: "m3", user: "u3", courier: "c2" }),
				member({ id: "m4", user: "u4", role: "dispatcher" }),
			],
			"c1",
		);
		expect(options).toEqual([
			{ userId: "u1", label: "Paul", assignable: true },
			{ userId: "u2", label: "u2", assignable: false },
		]);
	});
});

describe("rowSummary", () => {
	test("shows the place, the rider and the cash, never the recipient's name or phone", () => {
		const summary = rowSummary(
			row({
				rider: { name: "Paul", phone: "+237670000000" },
				codCollection: { expectedAmount: 15000 },
			}),
		);
		expect(summary).toEqual({
			number: "SHP-1",
			where: "Rue 1, Akwa, douala",
			riderName: "Paul",
			expectedCod: 15000,
		});
		expect(JSON.stringify(summary)).not.toContain("Aicha");
		expect(JSON.stringify(summary)).not.toContain("+2376000");
	});
});
