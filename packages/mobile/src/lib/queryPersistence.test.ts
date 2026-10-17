import { describe, expect, mock, test } from "bun:test";

mock.module("@react-native-async-storage/async-storage", () => ({
	default: {
		getItem: async () => null,
		setItem: async () => {},
		removeItem: async () => {},
	},
}));

const { PERSIST_MAX_AGE_MS, isRestorable, shouldPersistQuery } = await import(
	"./queryPersistence"
);

describe("query persistence", () => {
	test("keeps what helps offline, not everything", () => {
		expect(shouldPersistQuery(["listings", "recent", "Douala"])).toBe(true);
		expect(shouldPersistQuery(["shops", "s1", "orders", "list", {}])).toBe(
			true,
		);
		expect(shouldPersistQuery(["payment-status", "o1"])).toBe(false);
		expect(shouldPersistQuery([{ scope: "x" }])).toBe(false);
	});

	test("restores only the same account's fresh snapshot", () => {
		const snapshot = {
			userId: "u1",
			savedAt: 1_000,
			state: { mutations: [], queries: [] },
		};
		expect(isRestorable(snapshot, "u1", 2_000)).toBe(true);
		expect(isRestorable(snapshot, "u2", 2_000)).toBe(false);
		expect(isRestorable(snapshot, "u1", 1_000 + PERSIST_MAX_AGE_MS)).toBe(
			false,
		);
		expect(isRestorable(null, "u1")).toBe(false);
	});
});
