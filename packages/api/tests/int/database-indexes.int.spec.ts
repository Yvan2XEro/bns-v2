// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ensureIndexes, INDEXES } from "../../src/db/indexes";

/** The collection slugs Payload knows, from its generated types. */
function collectionSlugs(): Set<string> {
	const types = readFileSync(
		join(import.meta.dirname, "../../src/payload-types.ts"),
		"utf8",
	);
	const block = types.slice(
		types.indexOf("  collections: {"),
		types.indexOf("  collectionsJoins"),
	);
	return new Set(
		[...block.matchAll(/^ {4}'?([a-z0-9-]+)'?: /gm)].map((m) => m[1] ?? ""),
	);
}

const spec = (name: string) => INDEXES.find((index) => index.name === name);

describe("the database indexes", () => {
	it("each target a collection Payload has, under a unique name", () => {
		const known = collectionSlugs();
		expect(INDEXES.filter((index) => !known.has(index.collection))).toEqual([]);
		const names = INDEXES.map((index) => `${index.collection}.${index.name}`);
		expect(new Set(names).size).toBe(names.length);
	});

	it("keep the rules two simultaneous requests could otherwise break", () => {
		expect(spec("orders_buyer_idempotency_unique")).toMatchObject({
			collection: "orders",
			keys: { buyer: 1, idempotencyKey: 1 },
			options: {
				unique: true,
				partialFilterExpression: { idempotencyKey: { $type: "string" } },
			},
		});
		expect(spec("carts_active_user_unique")?.options).toMatchObject({
			unique: true,
			partialFilterExpression: { status: "active" },
		});
		expect(spec("commission_charge_per_order_unique")?.options).toMatchObject({
			unique: true,
			partialFilterExpression: { kind: "charge" },
		});
		expect(spec("risk_flags_one_open_subject_signal")).toMatchObject({
			keys: { subjectType: 1, subjectKey: 1, signal: 1 },
			options: { unique: true, partialFilterExpression: { status: "open" } },
		});
		expect(spec("viewer_1_listing_1_revealWindow_1")?.options).toMatchObject({
			unique: true,
		});
	});

	it("let view-flush rows expire on their own", () => {
		expect(spec("listing_view_flushes_purge_at")).toMatchObject({
			keys: { purgeAt: 1 },
			options: { expireAfterSeconds: 0 },
		});
	});
});

describe("ensureIndexes", () => {
	function collections(createIndex: ReturnType<typeof vi.fn>) {
		const dropIndex = vi.fn(async () => undefined);
		return {
			collectionOf: () => ({ createIndex, dropIndex }),
			dropIndex,
		};
	}

	it("creates every index, by name", async () => {
		const createIndex = vi.fn(async () => "ok");
		const { collectionOf } = collections(createIndex);
		expect(await ensureIndexes(collectionOf)).toEqual({
			created: INDEXES.length,
		});
		expect(createIndex).toHaveBeenCalledTimes(INDEXES.length);
		expect(createIndex.mock.calls[0]?.[1]).toMatchObject({
			name: INDEXES[0]?.name,
		});
	});

	it("replaces an index defined differently before", async () => {
		const createIndex = vi
			.fn()
			.mockRejectedValueOnce(Object.assign(new Error("conflict"), { code: 85 }))
			.mockResolvedValue("ok");
		const { collectionOf, dropIndex } = collections(createIndex);
		await ensureIndexes(collectionOf);
		expect(dropIndex).toHaveBeenCalledWith(INDEXES[0]?.name);
	});

	it("goes on past a refused index, then names it", async () => {
		const createIndex = vi
			.fn()
			.mockRejectedValueOnce(
				Object.assign(new Error("E11000 duplicate key"), { code: 11000 }),
			)
			.mockResolvedValue("ok");
		const { collectionOf } = collections(createIndex);
		await expect(ensureIndexes(collectionOf)).rejects.toThrow(
			`${INDEXES[0]?.collection}.${INDEXES[0]?.name}: E11000 duplicate key`,
		);
		expect(createIndex).toHaveBeenCalledTimes(INDEXES.length);
	});
});
