import { describe, expect, test } from "bun:test";
import { movementFromForm } from "./stockAdjust";

describe("movementFromForm", () => {
	test("a receipt adds the typed quantity", () => {
		expect(movementFromForm("receipt", 2, "10")).toEqual({
			quantity: 10,
			stockAfter: 12,
		});
	});

	test("a customer return adds the typed quantity", () => {
		expect(movementFromForm("return", 0, "1")).toEqual({
			quantity: 1,
			stockAfter: 1,
		});
	});

	test("a loss removes the typed quantity", () => {
		expect(movementFromForm("loss", 5, "2")).toEqual({
			quantity: -2,
			stockAfter: 3,
		});
	});

	test("a correction turns the counted stock into a signed delta", () => {
		expect(movementFromForm("adjustment", 5, "4")).toEqual({
			quantity: -1,
			stockAfter: 4,
		});
		expect(movementFromForm("adjustment", 2, "3")).toEqual({
			quantity: 1,
			stockAfter: 3,
		});
	});

	test("a correction equal to the current stock is no movement", () => {
		expect(movementFromForm("adjustment", 4, "4")).toBeNull();
	});

	test("a correction to zero is a valid negative delta", () => {
		expect(movementFromForm("adjustment", 5, "0")).toEqual({
			quantity: -5,
			stockAfter: 0,
		});
	});

	test("refuses nothing to record, zero and a negative result", () => {
		expect(movementFromForm("receipt", 2, "")).toBeNull();
		expect(movementFromForm("receipt", 2, "0")).toBeNull();
		expect(movementFromForm("adjustment", 4, "4")).toBeNull();
		expect(movementFromForm("loss", 1, "3")).toBeNull();
	});

	test("rejects text that is not a number", () => {
		expect(movementFromForm("receipt", 2, "abc")).toBeNull();
		expect(movementFromForm("receipt", 2, "ten")).toBeNull();
	});

	test("rejects hex-looking input instead of coercing it", () => {
		expect(movementFromForm("receipt", 2, "0x10")).toBeNull();
	});

	test("rejects exponent-looking input instead of coercing it", () => {
		expect(movementFromForm("receipt", 2, "1e3")).toBeNull();
	});

	test("rejects decimals and negative signs", () => {
		expect(movementFromForm("receipt", 2, "1.5")).toBeNull();
		expect(movementFromForm("receipt", 2, "-3")).toBeNull();
	});

	test("rejects whitespace-only input", () => {
		expect(movementFromForm("receipt", 2, "   ")).toBeNull();
	});
});
