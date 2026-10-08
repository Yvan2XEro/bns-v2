import { describe, expect, test } from "bun:test";
import type { BuyerShipmentView } from "../../../api/src/contracts/shipments";
import {
	pickupCountdown,
	rescheduleAllowed,
	rescheduleDays,
	showRiderCard,
	telHref,
	trackingSteps,
} from "./shipmentTracking";

const base: BuyerShipmentView = {
	id: "s1",
	shipmentNumber: "SHP-1",
	status: "pending",
	method: "seller_delivery",
	promisedBy: null,
	stepper: {
		readyAt: null,
		pickedUpAt: null,
		inTransitAt: null,
		terminalAt: null,
	},
	rider: null,
	attempts: [],
	redelivery: null,
	pickup: null,
	trackingUrl: null,
	proof: null,
	timeline: [],
	canReschedule: false,
};
const view = (patch: Partial<BuyerShipmentView>): BuyerShipmentView => ({
	...base,
	...patch,
});
const states = (v: BuyerShipmentView) => trackingSteps(v).map((s) => s.state);

describe("trackingSteps", () => {
	test("walks the four steps with the parcel's status", () => {
		expect(states(view({ status: "pending" }))).toEqual([
			"current",
			"upcoming",
			"upcoming",
			"upcoming",
		]);
		expect(states(view({ status: "picked_up" }))).toEqual([
			"done",
			"current",
			"upcoming",
			"upcoming",
		]);
		expect(states(view({ status: "in_transit" }))).toEqual([
			"done",
			"done",
			"current",
			"upcoming",
		]);
		expect(states(view({ status: "delivered" }))).toEqual([
			"done",
			"done",
			"done",
			"done",
		]);
	});

	test("a failed view has no current step, so no 'on the way'", () => {
		const failed = view({
			status: "failed",
			stepper: {
				...base.stepper,
				pickedUpAt: "2026-10-01T08:00:00Z",
				inTransitAt: "2026-10-01T09:00:00Z",
			},
		});
		expect(states(failed)).toEqual(["done", "done", "done", "upcoming"]);
		expect(states(failed)).not.toContain("current");
	});

	test("returned and cancelled keep only what was reached", () => {
		expect(states(view({ status: "cancelled" }))).toEqual([
			"upcoming",
			"upcoming",
			"upcoming",
			"upcoming",
		]);
		expect(
			states(
				view({
					status: "returned",
					stepper: { ...base.stepper, pickedUpAt: "x" },
				}),
			),
		).toEqual(["done", "done", "upcoming", "upcoming"]);
	});

	test("labels come from the buyer vocabulary and carry their dates", () => {
		const steps = trackingSteps(
			view({
				status: "delivered",
				stepper: { ...base.stepper, terminalAt: "2026-10-02T10:00:00Z" },
			}),
		);
		expect(steps.map((s) => s.labelKey)).toEqual([
			"delivery.statusBuyer.pending",
			"delivery.statusBuyer.picked_up",
			"delivery.statusBuyer.in_transit",
			"delivery.statusBuyer.delivered",
		]);
		expect(steps[3]?.at).toBe("2026-10-02T10:00:00Z");
	});

	test("a pickup parcel has two steps and the ready label once ready", () => {
		const steps = trackingSteps(
			view({
				method: "pickup",
				status: "pending",
				stepper: { ...base.stepper, readyAt: "2026-10-01T08:00:00Z" },
			}),
		);
		expect(steps.map((s) => [s.labelKey, s.state])).toEqual([
			["delivery.pendingReadyBuyer", "current"],
			["delivery.statusBuyer.delivered", "upcoming"],
		]);
	});
});

describe("rescheduleAllowed", () => {
	const now = new Date("2026-10-05T10:00:00Z");
	const redelivery = (rescheduleBy: string) => ({
		scheduledFor: "2026-10-06T11:00:00Z",
		window: "morning" as const,
		rescheduleBy,
	});

	test("follows the server flag", () => {
		expect(rescheduleAllowed(view({ canReschedule: false }), now)).toBe(false);
		expect(rescheduleAllowed(view({ canReschedule: true }), now)).toBe(true);
	});

	test("closes once the reschedule deadline has passed on screen", () => {
		expect(
			rescheduleAllowed(
				view({
					canReschedule: true,
					redelivery: redelivery("2026-10-05T09:59:00Z"),
				}),
				now,
			),
		).toBe(false);
		expect(
			rescheduleAllowed(
				view({
					canReschedule: true,
					redelivery: redelivery("2026-10-05T10:01:00Z"),
				}),
				now,
			),
		).toBe(true);
	});
});

describe("showRiderCard", () => {
	const rider = { firstName: "Paul", phone: "+237600000000" };
	test("shows while the parcel is out and hides on a delivered view", () => {
		expect(showRiderCard(view({ status: "in_transit", rider }))).toBe(true);
		expect(showRiderCard(view({ status: "delivered", rider }))).toBe(false);
		expect(showRiderCard(view({ status: "in_transit", rider: null }))).toBe(
			false,
		);
	});
});

describe("telHref", () => {
	test("keeps digits and the plus sign", () => {
		expect(telHref("+237 6 00-00 00 00")).toBe("tel:+237600000000");
	});
});

describe("pickupCountdown", () => {
	const now = new Date("2026-10-05T10:00:00Z");
	const at = (ms: number) => new Date(now.getTime() + ms).toISOString();
	test("picks the unit at its boundaries", () => {
		expect(pickupCountdown(null, now)).toEqual({ kind: "none" });
		expect(pickupCountdown(at(-1), now)).toEqual({ kind: "expired" });
		expect(pickupCountdown(at(3 * 86_400_000), now)).toEqual({
			kind: "days",
			count: 3,
		});
		expect(pickupCountdown(at(47 * 3_600_000), now)).toEqual({
			kind: "hours",
			count: 47,
		});
		expect(pickupCountdown(at(90_000), now)).toEqual({
			kind: "minutes",
			count: 2,
		});
	});
});

describe("rescheduleDays", () => {
	test("offers tomorrow at noon Douala time and stays inside seven days", () => {
		const days = rescheduleDays(new Date("2026-10-05T12:00:00Z"));
		expect(days[0]?.iso).toBe("2026-10-06T11:00:00.000Z");
		expect(days.at(-1)?.iso).toBe("2026-10-12T11:00:00.000Z");
		expect(days).toHaveLength(7);
	});

	test("drops a last day that would fall past the seven-day horizon", () => {
		const days = rescheduleDays(new Date("2026-10-05T10:00:00Z"));
		expect(days).toHaveLength(6);
		expect(days.at(-1)?.iso).toBe("2026-10-11T11:00:00.000Z");
	});
});
