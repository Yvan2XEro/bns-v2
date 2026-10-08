// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	DELIVERY_DAY_START_HOUR,
	DELIVERY_TIMEZONE,
	type DeliveryCalendar,
	nextDeliveryStart,
	pickupReadyAt,
	promisedByFrom,
	rescheduleDateAllowed,
	windowBounds,
} from "../../src/lib/delivery/eta";

const MONDAY_TO_SATURDAY: DeliveryCalendar = {
	deliveryDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
	cutoffTime: "17:00",
};

describe("delivery calendar", () => {
	it("keeps pickup preparation inside the opening hours, carrying the remainder to the next open day", () => {
		expect(
			pickupReadyAt(new Date("2026-10-05T15:00:00.000Z"), 2, [
				{ day: "mon", opens: "09:00", closes: "17:00" },
				{ day: "tue", opens: "09:00", closes: "17:00" },
			]).toISOString(),
		).toBe("2026-10-06T09:00:00.000Z");
	});
	it("does not promise pickup before the location opens", () => {
		expect(
			pickupReadyAt(new Date("2026-10-04T10:00:00.000Z"), 2, [
				{ day: "mon", opens: "09:00", closes: "17:00" },
			]).toISOString(),
		).toBe("2026-10-05T10:00:00.000Z");
	});
	it("declares Douala as the only delivery timezone and starts the workday at 08:00", () => {
		expect(DELIVERY_TIMEZONE).toBe("Africa/Douala");
		expect(DELIVERY_DAY_START_HOUR).toBe(8);
	});

	it("moves an after-cutoff Friday order to Saturday at 08:00 Douala time", () => {
		expect(
			nextDeliveryStart(
				new Date("2026-10-09T18:00:00.000Z"),
				MONDAY_TO_SATURDAY,
			).toISOString(),
		).toBe("2026-10-10T07:00:00.000Z");
	});

	it("keeps an order before cutoff at its current instant", () => {
		const now = new Date("2026-10-09T14:00:00.000Z");
		expect(nextDeliveryStart(now, MONDAY_TO_SATURDAY).toISOString()).toBe(
			now.toISOString(),
		);
	});

	it("moves a Sunday order to Monday at 08:00 Douala time", () => {
		expect(
			nextDeliveryStart(
				new Date("2026-10-11T11:00:00.000Z"),
				MONDAY_TO_SATURDAY,
			).toISOString(),
		).toBe("2026-10-12T07:00:00.000Z");
	});

	it("adds preparation and delivery hours while skipping Sunday", () => {
		const start = nextDeliveryStart(
			new Date("2026-10-09T18:00:00.000Z"),
			MONDAY_TO_SATURDAY,
		);
		expect(promisedByFrom(start, 2, 48, MONDAY_TO_SATURDAY).toISOString()).toBe(
			"2026-10-13T09:00:00.000Z",
		);
	});

	it("allows only delivery days within the next seven days for rescheduling", () => {
		const now = new Date("2026-10-09T14:00:00.000Z");
		expect(
			rescheduleDateAllowed(
				new Date("2026-10-10T12:00:00.000Z"),
				MONDAY_TO_SATURDAY,
				now,
			),
		).toBe(true);
		expect(
			rescheduleDateAllowed(
				new Date("2026-10-11T12:00:00.000Z"),
				MONDAY_TO_SATURDAY,
				now,
			),
		).toBe(false);
		expect(
			rescheduleDateAllowed(
				new Date("2026-10-17T12:00:00.000Z"),
				MONDAY_TO_SATURDAY,
				now,
			),
		).toBe(false);
	});

	it("maps each delivery window to its exact local hours", () => {
		expect(windowBounds("morning")).toEqual({ fromHour: 8, toHour: 12 });
		expect(windowBounds("afternoon")).toEqual({ fromHour: 12, toHour: 16 });
		expect(windowBounds("evening")).toEqual({ fromHour: 16, toHour: 20 });
	});
});
