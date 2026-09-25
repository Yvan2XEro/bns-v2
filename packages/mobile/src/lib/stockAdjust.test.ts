import { describe, expect, test } from "bun:test";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	emptyStockAdjustForm,
	movementFromForm,
	stockAdjustSchema,
} from "./stockAdjust";

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

/**
 * `useStockAdjustForm.changeType` relies on a whole-form `trigger()` (no
 * field names) to clear a stale error on a field the schema no longer
 * validates — e.g. `unitCost`, once the type isn't `receipt` — because
 * `setValue(..., { shouldValidate: true })` only reapplies the resolver's
 * verdict to the field(s) it names, leaving errors on every other field
 * untouched (a known react-hook-form + resolver gotcha). These tests call
 * the exact resolver the hook uses — `zodResolver(stockAdjustSchema(...))`,
 * the real `@hookform/resolvers` + `zod` from this repo, not a stand-in —
 * to pin the guarantee a whole-form re-validation depends on: the schema
 * reports no `unitCost` error once the active type no longer checks it, so
 * replacing `formState.errors` wholesale (what `trigger()` does) discards
 * the stale one instead of merging around it (what a per-field trigger does).
 * There is no DOM/render harness in this package's test setup to mount
 * `useForm` itself and drive `setValue`/`trigger` through a live component;
 * this is the resolver-level guarantee that `changeType`'s fix depends on.
 */
describe("stockAdjustSchema resolver — errors on fields outside the active type", () => {
	const options = { fields: {}, shouldUseNativeValidation: false };

	test("an invalid unitCost is reported while the type is receipt", async () => {
		const resolver = zodResolver(stockAdjustSchema(5));
		const values = {
			...emptyStockAdjustForm,
			type: "receipt" as const,
			amount: "10",
			unitCost: "not-a-number",
		};
		const result = await resolver(values, undefined, options);
		expect(result.errors.unitCost).toBeDefined();
	});

	test("the same invalid unitCost is not reported once the type is no longer receipt", async () => {
		const resolver = zodResolver(stockAdjustSchema(5));
		// The seller never touched this field; its stale garbage value is
		// still sitting in the form after switching away from "receipt".
		const values = {
			...emptyStockAdjustForm,
			type: "loss" as const,
			amount: "2",
			unitCost: "not-a-number",
		};
		const result = await resolver(values, undefined, options);
		expect(result.errors.unitCost).toBeUndefined();
		expect(result.errors.amount).toBeUndefined();
	});
});
