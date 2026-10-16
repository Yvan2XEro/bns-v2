// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	arrivalClock,
	isOutForDelivery,
	RIDER_PHONE_LIMITS,
} from "../../src/contracts/shipments";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import { revealRiderPhone } from "../../src/services/delivery/riderPhone";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-16T13:00:00.000Z");

function world(shipment: Record<string, unknown> = {}) {
	return fakePayload({
		orders: [{ id: "order-1", buyer: "buyer-1", status: "shipped" }],
		shipments: [
			{
				id: "shipment-1",
				shipmentNumber: "SHP-1",
				order: "order-1",
				status: "in_transit",
				carrier: "courier",
				rider: { name: "Samuel Tchoua", phone: " +237699000001 " },
				...shipment,
			},
		],
	});
}

const reveal = (
	payload: ReturnType<typeof world>,
	viewerId = "buyer-1",
	store = new MemoryCounterStore(() => NOW.getTime()),
) =>
	revealRiderPhone(
		payload,
		{ shipmentId: "shipment-1", viewerId, now: NOW },
		{ store },
	);

describe("revealRiderPhone", () => {
	it("hands the order's buyer the rider's phone and logs a staff-only event", async () => {
		const payload = world();
		expect(await reveal(payload)).toEqual({ phone: "+237699000001" });
		expect(payload.store["shipment-events"]).toHaveLength(1);
		expect(payload.store["shipment-events"]?.[0]).toMatchObject({
			shipment: "shipment-1",
			order: "order-1",
			type: "shipment.rider_phone_revealed",
			actorType: "buyer",
			actor: "buyer-1",
			visibility: "staff",
			occurredAt: NOW.toISOString(),
		});
	});

	it("answers 404 to anyone but the order's buyer, and for a missing shipment", async () => {
		await expect(reveal(world(), "stranger")).rejects.toMatchObject({
			code: "generic.notFound",
			status: 404,
		});
		const payload = world();
		await expect(
			revealRiderPhone(
				payload,
				{ shipmentId: "nope", viewerId: "buyer-1", now: NOW },
				{ store: new MemoryCounterStore() },
			),
		).rejects.toMatchObject({ status: 404 });
		expect(payload.store["shipment-events"] ?? []).toHaveLength(0);
	});

	it("refuses outside the out-for-delivery window or without a phone", async () => {
		for (const status of [
			"pending",
			"delivered",
			"failed",
			"returned",
			"cancelled",
		]) {
			await expect(reveal(world({ status }))).rejects.toMatchObject({
				code: "contact.phoneUnavailable",
				status: 404,
			});
		}
		await expect(
			reveal(world({ rider: { name: "Samuel" } })),
		).rejects.toMatchObject({ code: "contact.phoneUnavailable" });
		expect(await reveal(world({ status: "picked_up" }))).toEqual({
			phone: "+237699000001",
		});
	});

	it("rate-limits per viewer before any lookup", async () => {
		const store = new MemoryCounterStore(() => NOW.getTime());
		const payload = world();
		const hourly = RIDER_PHONE_LIMITS[0].limit;
		for (let i = 0; i < hourly; i += 1) {
			await reveal(payload, "buyer-1", store);
		}
		await expect(reveal(payload, "buyer-1", store)).rejects.toMatchObject({
			code: "generic.rateLimited",
			status: 429,
		});
		expect(payload.store["shipment-events"]).toHaveLength(hourly);
	});
});

describe("out for delivery and arrival clock", () => {
	it("counts only picked_up and in_transit as out for delivery", () => {
		expect(isOutForDelivery("picked_up")).toBe(true);
		expect(isOutForDelivery("in_transit")).toBe(true);
		expect(isOutForDelivery("pending")).toBe(false);
		expect(isOutForDelivery("failed")).toBe(false);
		expect(isOutForDelivery("delivered")).toBe(false);
	});

	it("formats an ETA as a 24-hour clock in the market timezone", () => {
		expect(arrivalClock("2026-10-16T14:40:00.000Z")).toBe("15:40");
		expect(arrivalClock("2026-10-16T23:05:00.000Z")).toBe("00:05");
		expect(arrivalClock("2026-10-16T14:40:00.000Z", "UTC")).toBe("14:40");
		expect(arrivalClock(null)).toBeNull();
		expect(arrivalClock("not a date")).toBeNull();
	});
});
