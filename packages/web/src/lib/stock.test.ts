import { describe, expect, test } from "bun:test";
import { availableDelta } from "./stock";

describe("availableDelta", () => {
	test("a reservation takes a unit away from what buyers can order", () => {
		expect(availableDelta({ type: "reservation", quantity: 1 })).toBe(-1);
		expect(availableDelta({ type: "release", quantity: -1 })).toBe(1);
	});
	test("every other movement keeps its own sign", () => {
		expect(availableDelta({ type: "receipt", quantity: 5 })).toBe(5);
		expect(availableDelta({ type: "loss", quantity: -2 })).toBe(-2);
	});
});
