import { describe, expect, test } from "bun:test";
import type { BuyerShipmentView } from "../../../api/src/contracts/shipments";
import {
	attemptRows,
	countdownParts,
	formatDeliveryDate,
	proofCard,
	rescheduleChoices,
	riderCardVisible,
	shipmentsExist,
	trackingHeadlineKey,
	trackingSteps,
} from "./shipment-tracking";

const view = (over: Partial<BuyerShipmentView> = {}): BuyerShipmentView => ({
	id: "ship-1",
	shipmentNumber: "SHP-1",
	status: "pending",
	method: "seller_delivery",
	promisedBy: "2026-10-10T16:00:00.000Z",
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
	...over,
});

const states = (v: BuyerShipmentView) =>
	trackingSteps(v).map((step) => `${step.key}:${step.state}`);

describe("trackingSteps for a delivery", () => {
	const cases: Array<[BuyerShipmentView["status"], string[]]> = [
		[
			"pending",
			[
				"prepared:current",
				"picked_up:upcoming",
				"in_transit:upcoming",
				"delivered:upcoming",
			],
		],
		[
			"picked_up",
			[
				"prepared:done",
				"picked_up:current",
				"in_transit:upcoming",
				"delivered:upcoming",
			],
		],
		[
			"in_transit",
			[
				"prepared:done",
				"picked_up:done",
				"in_transit:current",
				"delivered:upcoming",
			],
		],
		[
			"delivered",
			["prepared:done", "picked_up:done", "in_transit:done", "delivered:done"],
		],
		[
			"failed",
			[
				"prepared:done",
				"picked_up:done",
				"in_transit:done",
				"delivered:stopped",
			],
		],
		[
			"returned",
			[
				"prepared:done",
				"picked_up:done",
				"in_transit:done",
				"delivered:stopped",
			],
		],
		[
			"cancelled",
			[
				"prepared:done",
				"picked_up:stopped",
				"in_transit:stopped",
				"delivered:stopped",
			],
		],
	];
	for (const [status, expected] of cases) {
		test(`${status} reads ${expected.join(" ")}`, () => {
			expect(states(view({ status }))).toEqual(expected);
		});
	}

	test("each step carries its own date and the end date only once delivered", () => {
		const steps = trackingSteps(
			view({
				status: "delivered",
				stepper: {
					readyAt: null,
					pickedUpAt: "2026-10-09T08:00:00.000Z",
					inTransitAt: "2026-10-09T09:00:00.000Z",
					terminalAt: "2026-10-09T12:00:00.000Z",
				},
			}),
		);
		expect(steps.map((step) => step.at)).toEqual([
			null,
			"2026-10-09T08:00:00.000Z",
			"2026-10-09T09:00:00.000Z",
			"2026-10-09T12:00:00.000Z",
		]);
		const returned = trackingSteps(
			view({
				status: "returned",
				stepper: {
					readyAt: null,
					pickedUpAt: null,
					inTransitAt: null,
					terminalAt: "2026-10-09T12:00:00.000Z",
				},
			}),
		);
		expect(returned[3]?.at).toBeNull();
	});
});

describe("trackingSteps for a pickup", () => {
	const pickup = (over: Partial<BuyerShipmentView>) =>
		view({ method: "pickup", ...over });

	test("a parcel still being prepared has not reached the ready step", () => {
		expect(states(pickup({ status: "pending" }))).toEqual([
			"prepared:current",
			"ready:upcoming",
			"delivered:upcoming",
		]);
	});

	test("once ready it waits at the counter, with the ready date", () => {
		const ready = pickup({
			status: "pending",
			stepper: {
				readyAt: "2026-10-09T10:00:00.000Z",
				pickedUpAt: null,
				inTransitAt: null,
				terminalAt: null,
			},
		});
		expect(states(ready)).toEqual([
			"prepared:done",
			"ready:current",
			"delivered:upcoming",
		]);
		expect(trackingSteps(ready)[1]?.at).toBe("2026-10-09T10:00:00.000Z");
	});

	test("collected and not collected end the road", () => {
		expect(states(pickup({ status: "delivered" }))).toEqual([
			"prepared:done",
			"ready:done",
			"delivered:done",
		]);
		expect(states(pickup({ status: "returned" }))).toEqual([
			"prepared:done",
			"ready:done",
			"delivered:stopped",
		]);
	});
});

describe("headline", () => {
	test("reads the buyer vocabulary, the pickup variant once ready", () => {
		expect(trackingHeadlineKey(view({ status: "in_transit" }))).toBe(
			"statusBuyer.in_transit",
		);
		expect(
			trackingHeadlineKey(
				view({
					status: "pending",
					stepper: {
						readyAt: "2026-10-09T10:00:00.000Z",
						pickedUpAt: null,
						inTransitAt: null,
						terminalAt: null,
					},
				}),
			),
		).toBe("pendingReadyBuyer");
		expect(trackingHeadlineKey(view({ status: "pending" }))).toBe(
			"statusBuyer.pending",
		);
	});
});

describe("riderCardVisible", () => {
	const rider = { firstName: "Paul", phone: "+237670000000" };

	test("shows while the rider carries or retries the parcel", () => {
		for (const status of ["picked_up", "in_transit", "failed"] as const) {
			expect(riderCardVisible(view({ status, rider }))).toBe(true);
		}
	});

	test("never shows once the parcel is delivered, returned or cancelled", () => {
		for (const status of [
			"delivered",
			"returned",
			"cancelled",
			"pending",
		] as const) {
			expect(riderCardVisible(view({ status, rider }))).toBe(false);
		}
	});

	test("never shows without a rider", () => {
		expect(riderCardVisible(view({ status: "in_transit" }))).toBe(false);
	});
});

describe("attempts and proof", () => {
	test("each attempt maps to its failure-reason label; an unknown reason reads as other", () => {
		const rows = attemptRows(
			view({
				attempts: [
					{ number: 1, reason: "absent", at: "2026-10-09T10:00:00.000Z" },
					{
						number: 2,
						reason: "something_new",
						at: "2026-10-10T10:00:00.000Z",
					},
				],
			}),
		);
		expect(rows.map((row) => [row.number, row.labelKey])).toEqual([
			[1, "failureReason.absent"],
			[2, "failureReason.other"],
		]);
	});

	test("the proof card carries the signed photo URL and the code flag as served", () => {
		const proof = {
			handoverMethod: "otp",
			capturedAt: "2026-10-09T12:00:00.000Z",
			photoUrl: "/api/delivery-proofs/files/p1?exp=1&sig=2",
			codeVerified: true,
		};
		expect(proofCard(view({ proof }), false)).toEqual({
			at: "2026-10-09T12:00:00.000Z",
			photoUrl: "/api/delivery-proofs/files/p1?exp=1&sig=2",
			codeVerified: true,
			contestable: false,
		});
		expect(proofCard(view({ proof: null }), true)).toBeNull();
	});

	test("contest is offered only when the order's action table offers it", () => {
		const proof = {
			handoverMethod: "seller_declaration",
			capturedAt: "2026-10-09T12:00:00.000Z",
			photoUrl: null,
			codeVerified: false,
		};
		expect(proofCard(view({ proof }), true)?.contestable).toBe(true);
		expect(proofCard(view({ proof }), false)?.contestable).toBe(false);
	});
});

describe("countdownParts", () => {
	const now = new Date("2026-10-09T10:00:00.000Z");
	const at = (ms: number) => new Date(now.getTime() + ms).toISOString();

	test("two days out and more counts whole days", () => {
		expect(countdownParts(at(2 * 86_400_000), now)).toEqual({
			unit: "days",
			count: 2,
		});
		expect(countdownParts(at(2 * 86_400_000 - 1), now)).toEqual({
			unit: "hours",
			count: 47,
		});
	});

	test("an hour out up to two days counts whole hours", () => {
		expect(countdownParts(at(3_600_000), now)).toEqual({
			unit: "hours",
			count: 1,
		});
		expect(countdownParts(at(3_600_000 - 1), now)).toEqual({
			unit: "minutes",
			count: 60,
		});
	});

	test("under an hour counts minutes, never zero", () => {
		expect(countdownParts(at(1), now)).toEqual({ unit: "minutes", count: 1 });
	});

	test("at or past the deadline it has expired", () => {
		expect(countdownParts(at(0), now)).toEqual({ unit: "expired", count: 0 });
		expect(countdownParts(at(-1000), now)).toEqual({
			unit: "expired",
			count: 0,
		});
	});
});

describe("rescheduleChoices", () => {
	test("offers the next seven days with each window's start in the delivery timezone", () => {
		// 10:00 Douala (UTC+1) on Fri 9 Oct 2026.
		const now = new Date("2026-10-09T09:00:00.000Z");
		const choices = rescheduleChoices(now);
		expect(choices.map((day) => day.key)).toEqual([
			"2026-10-10",
			"2026-10-11",
			"2026-10-12",
			"2026-10-13",
			"2026-10-14",
			"2026-10-15",
			"2026-10-16",
		]);
		expect(choices[0]?.windows).toEqual([
			{ window: "morning", iso: "2026-10-10T07:00:00.000Z" },
			{ window: "afternoon", iso: "2026-10-10T11:00:00.000Z" },
			{ window: "evening", iso: "2026-10-10T15:00:00.000Z" },
		]);
	});

	test("drops a window that starts beyond the seven-day horizon", () => {
		const now = new Date("2026-10-09T09:00:00.000Z");
		// 09:00Z + 7d = 16 Oct 09:00Z; the morning window starts 07:00Z, the afternoon 11:00Z.
		const last = rescheduleChoices(now).at(-1);
		expect(last?.key).toBe("2026-10-16");
		expect(last?.windows.map((w) => w.window)).toEqual(["morning"]);
	});
});

describe("formatDeliveryDate", () => {
	test("renders the date in the delivery timezone, not the browser's", () => {
		// 23:30Z on the 9th is already the 10th in Douala.
		expect(formatDeliveryDate("2026-10-09T23:30:00.000Z", "en")).toBe(
			"Saturday, October 10",
		);
		expect(formatDeliveryDate("2026-10-09T23:30:00.000Z", "fr")).toBe(
			"samedi 10 octobre",
		);
	});
});

describe("shipmentsExist", () => {
	test("is false before acceptance and after a cancellation, true after", () => {
		for (const status of [
			"placed",
			"confirmed",
			"paid",
			"cancelled",
		] as const) {
			expect(shipmentsExist(status)).toBe(false);
		}
		for (const status of [
			"accepted",
			"shipped",
			"delivered",
			"completed",
			"disputed",
			"returned",
			"delivery_failed",
		] as const) {
			expect(shipmentsExist(status)).toBe(true);
		}
	});
});
