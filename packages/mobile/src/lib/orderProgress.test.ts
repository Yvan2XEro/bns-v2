import { describe, expect, test } from "bun:test";
import type { OrderTimestamps } from "@/src/types/order";
import { orderProgress } from "./orderProgress";

const timestamps: OrderTimestamps = {
	placedAt: "2026-10-14T09:12:00.000Z",
	confirmedAt: "2026-10-14T09:14:00.000Z",
	acceptedAt: "2026-10-14T10:03:00.000Z",
	shippedAt: "2026-10-14T11:40:00.000Z",
	deliveredAt: null,
	completedAt: null,
	cancelledAt: null,
	failedAt: null,
};

describe("orderProgress", () => {
	test("marks the steps before the status done and the status itself current", () => {
		const steps = orderProgress("shipped", timestamps);
		expect(steps?.map((s) => s.state)).toEqual([
			"done",
			"done",
			"done",
			"current",
			"todo",
		]);
		expect(steps?.[3]?.at).toBe(timestamps.shippedAt);
		expect(steps?.[4]?.at).toBeNull();
	});

	test("a delivered order has every step done", () => {
		const steps = orderProgress("delivered", {
			...timestamps,
			deliveredAt: "2026-10-14T15:00:00.000Z",
		});
		expect(steps?.every((s) => s.state === "done")).toBe(true);
	});

	test("a paid order sits on the confirmed step", () => {
		expect(orderProgress("paid", timestamps)?.[1]?.state).toBe("current");
	});

	test("a cancelled or failed order has no stepper", () => {
		expect(orderProgress("cancelled", timestamps)).toBeNull();
		expect(orderProgress("delivery_failed", timestamps)).toBeNull();
	});
});
