import { describe, expect, mock, test } from "bun:test";

const store = new Map<string, string>();
mock.module("@react-native-async-storage/async-storage", () => ({
	default: {
		getItem: async (key: string) => store.get(key) ?? null,
		setItem: async (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: async (key: string) => {
			store.delete(key);
		},
	},
}));

const {
	clearCreateDraft,
	createDraftKey,
	isDraftWorthKeeping,
	loadCreateDraft,
	saveCreateDraft,
} = await import("./createDraft");

const blank = {
	title: "",
	description: "",
	category: null,
	price: "",
	images: [],
	tags: [],
};

describe("create draft", () => {
	test("an untouched form is not worth keeping", () => {
		expect(isDraftWorthKeeping(blank)).toBe(false);
		expect(isDraftWorthKeeping({ ...blank, title: "  " })).toBe(false);
		expect(isDraftWorthKeeping({ ...blank, price: "1500" })).toBe(true);
		expect(isDraftWorthKeeping({ ...blank, images: [{}] })).toBe(true);
	});

	test("is kept per account and survives a round trip", async () => {
		await saveCreateDraft("u1", { ...blank, title: "Vélo" });
		expect(await loadCreateDraft<typeof blank>("u1")).toMatchObject({
			title: "Vélo",
		});
		expect(await loadCreateDraft("u2")).toBeNull();
		expect(createDraftKey("u1")).toBe("bns.createDraft.v1.u1");
		await clearCreateDraft("u1");
		expect(await loadCreateDraft("u1")).toBeNull();
	});
});
