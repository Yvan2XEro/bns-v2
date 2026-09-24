import { describe, expect, test } from "bun:test";
import { type StepState, stepReducer } from "./catalogueStepper";

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

	test("start on an unknown row is a no-op", () => {
		const state: StepState = {};
		expect(stepReducer(state, { type: "start", rowId: "missing" })).toBe(state);
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

	test("fail on an unknown row is a no-op", () => {
		const state: StepState = {};
		expect(stepReducer(state, { type: "fail", rowId: "missing" })).toBe(state);
	});
});
