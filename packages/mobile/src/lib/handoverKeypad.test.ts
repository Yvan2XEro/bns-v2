import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import type { OrderHandoverView } from "../types/order";
import {
	FALLBACK_KEYS,
	handoverCodeSchema,
	handoverScreenState,
	pressKey,
	readHandoverFailure,
} from "./handoverKeypad";

type Json = { [key: string]: Json | string };

function handover(patch: Partial<OrderHandoverView> = {}): OrderHandoverView {
	return {
		method: null,
		locked: false,
		attemptsLeft: 3,
		regenerationsLeft: 2,
		...patch,
	};
}

/** The shape `lib/api.ts` throws: the whole response body under `data`. */
function apiError(code: string, details?: unknown) {
	return Object.assign(new Error(code), {
		status: code === "order.handoverLocked" ? 409 : 400,
		code,
		data: { code, message: "x", ...(details ? { details } : {}) },
	});
}

describe("the keypad", () => {
	test("digits append up to four and stop there", () => {
		let code = "";
		for (const key of ["1", "2", "3", "4", "5"] as const) {
			code = pressKey(code, key);
		}
		expect(code).toBe("1234");
	});

	test("delete removes the last digit and is harmless on an empty code", () => {
		expect(pressKey("123", "delete")).toBe("12");
		expect(pressKey("", "delete")).toBe("");
	});

	test("only four digits submit", () => {
		expect(handoverCodeSchema.safeParse({ code: "0427" }).success).toBe(true);
		expect(handoverCodeSchema.safeParse({ code: "042" }).success).toBe(false);
	});
});

describe("reading a failed POST", () => {
	test("a wrong code carries the attempts the server counts", () => {
		expect(
			readHandoverFailure(
				apiError("order.handoverCodeInvalid", {
					handover: { locked: false },
					attemptsLeft: 1,
				}),
			),
		).toEqual({ wrong: true, locked: false, attemptsLeft: 1 });
	});

	test("the body's lock flag locks", () => {
		expect(
			readHandoverFailure(
				apiError("order.handoverCodeInvalid", {
					handover: { locked: true },
					attemptsLeft: 0,
				}),
			),
		).toEqual({ wrong: true, locked: true, attemptsLeft: 0 });
	});

	test("the lock code locks even without details", () => {
		expect(readHandoverFailure(apiError("order.handoverLocked"))).toEqual({
			wrong: false,
			locked: true,
			attemptsLeft: null,
		});
	});

	test("any other failure is not a handover answer", () => {
		expect(readHandoverFailure(apiError("generic.network"))).toBeNull();
		expect(readHandoverFailure(new Error("boom"))).toBeNull();
		expect(readHandoverFailure(null)).toBeNull();
	});
});

describe("what the handover screen shows", () => {
	test("an open code shows the keypad with the order's attempts", () => {
		expect(handoverScreenState(handover(), null, true)).toEqual({
			kind: "keypad",
			attemptsLeft: 3,
			wrong: false,
		});
	});

	test("a wrong code shows the keypad with the error body's count", () => {
		expect(
			handoverScreenState(
				handover({ attemptsLeft: 3 }),
				{ wrong: true, locked: false, attemptsLeft: 2 },
				true,
			),
		).toEqual({ kind: "keypad", attemptsLeft: 2, wrong: true });
	});

	test("offers the two fallbacks when locked", () => {
		const fromOrder = handoverScreenState(
			handover({ locked: true, attemptsLeft: 0 }),
			null,
			true,
		);
		const fromError = handoverScreenState(
			handover(),
			{ wrong: true, locked: true, attemptsLeft: 0 },
			true,
		);
		for (const state of [fromOrder, fromError]) {
			expect(state).toEqual({
				kind: "locked",
				fallbacks: ["buyer_confirmation", "seller_declaration"],
			});
		}
	});

	test("an exhausted budget is a lock even before the flag arrives", () => {
		expect(
			handoverScreenState(
				handover(),
				{ wrong: true, locked: false, attemptsLeft: 0 },
				true,
			).kind,
		).toBe("locked");
	});

	test("without the right to declare only the buyer's path is offered", () => {
		expect(
			handoverScreenState(handover({ locked: true }), null, false),
		).toEqual({ kind: "locked", fallbacks: ["buyer_confirmation"] });
	});

	test("every fallback has its copy in both locales", () => {
		const keys = Object.values(FALLBACK_KEYS).flatMap((k) => [k.title, k.body]);
		expect(keys).toHaveLength(4);
		const read = (catalogue: Json, path: string) =>
			path
				.split(".")
				.reduce<Json | string | undefined>(
					(acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined),
					catalogue,
				);
		for (const key of keys) {
			expect(typeof read(en as Json, key)).toBe("string");
			expect(typeof read(fr as Json, key)).toBe("string");
		}
	});
});
