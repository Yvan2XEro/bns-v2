// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	canTransition,
	isTerminal,
	transitionPath,
} from "../../src/lib/paymentTransitions";

const STATUSES = [
	"created",
	"pending",
	"succeeded",
	"failed",
	"cancelled",
	"expired",
] as const;

const ALLOWED = new Set([
	"created>pending",
	"created>failed",
	"created>cancelled",
	"pending>succeeded",
	"pending>failed",
	"pending>cancelled",
	"pending>expired",
]);

describe("intent transition table", () => {
	const pairs = STATUSES.flatMap((from) =>
		STATUSES.map((to) => [from, to] as const),
	);

	it.each(pairs)("%s -> %s", (from, to) => {
		expect(canTransition(from, to)).toBe(ALLOWED.has(`${from}>${to}`));
	});

	it("treats the four end states as terminal", () => {
		expect(STATUSES.filter(isTerminal)).toEqual([
			"succeeded",
			"failed",
			"cancelled",
			"expired",
		]);
	});

	it("never lets a later failure undo a success", () => {
		expect(transitionPath("succeeded", "failed")).toEqual([]);
		expect(transitionPath("succeeded", "cancelled")).toEqual([]);
	});

	it("walks a created intent through pending when the provider reports first", () => {
		expect(transitionPath("created", "succeeded")).toEqual([
			"pending",
			"succeeded",
		]);
		expect(transitionPath("created", "expired")).toEqual([
			"pending",
			"expired",
		]);
		expect(transitionPath("created", "failed")).toEqual(["failed"]);
	});

	it("has nothing to do for a repeated status", () => {
		expect(transitionPath("pending", "pending")).toEqual([]);
	});
});
