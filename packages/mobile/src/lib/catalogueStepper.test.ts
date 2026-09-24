import { describe, expect, test } from "bun:test";
import {
	needsFlush,
	rowsNeedingFlush,
	type StepState,
	stepReducer,
} from "./catalogueStepper";

describe("stepReducer", () => {
	test("queue accumulates taps for a new row", () => {
		let state: StepState = {};
		state = stepReducer(state, { type: "queue", rowId: "a", delta: 1 });
		state = stepReducer(state, { type: "queue", rowId: "a", delta: 1 });
		state = stepReducer(state, { type: "queue", rowId: "a", delta: -1 });
		expect(state.a).toEqual({ pending: 1, committing: false });
	});

	test("queue on separate rows never mixes their pending amounts", () => {
		let state: StepState = {};
		state = stepReducer(state, { type: "queue", rowId: "a", delta: 3 });
		state = stepReducer(state, { type: "queue", rowId: "b", delta: -2 });
		expect(state.a.pending).toBe(3);
		expect(state.b.pending).toBe(-2);
	});

	test("start marks the row committing without touching pending", () => {
		let state: StepState = { a: { pending: 2, committing: false } };
		state = stepReducer(state, { type: "start", rowId: "a" });
		expect(state.a).toEqual({ pending: 2, committing: true });
	});

	test("start ignores an unrelated row and leaves existing entries untouched", () => {
		const state: StepState = { a: { pending: 2, committing: false } };
		const next = stepReducer(state, { type: "start", rowId: "b" });
		expect(next).toEqual({ a: { pending: 2, committing: false } });
	});

	test("settle removes the row once the applied delta matches pending", () => {
		let state: StepState = { a: { pending: 2, committing: true } };
		state = stepReducer(state, { type: "settle", rowId: "a", appliedDelta: 2 });
		expect(state.a).toBeUndefined();
	});

	test("settle keeps the remainder queued when taps arrived mid-flight", () => {
		// The request sent a delta of 2, but a further tap queued +1 while it
		// was in flight — that extra unit must survive as pending, ready to be
		// flushed next, and committing must drop back to false.
		let state: StepState = { a: { pending: 3, committing: true } };
		state = stepReducer(state, { type: "settle", rowId: "a", appliedDelta: 2 });
		expect(state.a).toEqual({ pending: 1, committing: false });
	});

	test("fail drops all pending for the row, including taps queued mid-flight", () => {
		let state: StepState = { a: { pending: 4, committing: true } };
		state = stepReducer(state, { type: "fail", rowId: "a" });
		expect(state.a).toBeUndefined();
	});

	test("fail ignores an unrelated row and leaves existing entries untouched", () => {
		const state: StepState = { a: { pending: 2, committing: false } };
		const next = stepReducer(state, { type: "fail", rowId: "b" });
		expect(next).toEqual({ a: { pending: 2, committing: false } });
	});

	test("a tap that lands mid-flight is detected as needing an immediate re-flush once the write settles", () => {
		// This pins the fix for a real bug: `step()` queues a mid-flight tap but
		// arms no timer for it, since the stepper buttons are disabled while
		// `committing`. Without a caller checking `needsFlush` right after
		// `settle`, that remainder was stranded on screen forever.
		let state: StepState = {};
		state = stepReducer(state, { type: "queue", rowId: "a", delta: 1 });
		state = stepReducer(state, { type: "start", rowId: "a" });
		state = stepReducer(state, { type: "queue", rowId: "a", delta: 1 });
		expect(needsFlush(state, "a")).toBe(false); // still in flight, nothing to do yet
		state = stepReducer(state, { type: "settle", rowId: "a", appliedDelta: 1 });
		expect(state.a).toEqual({ pending: 1, committing: false });
		expect(needsFlush(state, "a")).toBe(true);
		expect(rowsNeedingFlush(state)).toEqual(["a"]);
	});

	test("rowsNeedingFlush lists every row still owed a write, never one mid-flight or settled", () => {
		const state: StepState = {
			a: { pending: 2, committing: false }, // debouncing — teardown must not lose this
			b: { pending: -1, committing: true }, // already in flight, nothing to do
			c: { pending: 0, committing: false }, // fully settled
		};
		expect(rowsNeedingFlush(state)).toEqual(["a"]);
	});
});
