import { describe, expect, it, vi } from "vitest";
import { up } from "../../src/migrations/20260930_000000_p2_verification_levels";

function fakeMongo() {
	const users = [
		{
			_id: "u-1",
			verified: true,
			updatedAt: new Date("2026-05-01T00:00:00.000Z"),
		},
		{
			_id: "u-2",
			verified: false,
			updatedAt: new Date("2026-06-01T00:00:00.000Z"),
		},
		{ _id: "u-3", updatedAt: new Date("2026-07-01T00:00:00.000Z") },
	];
	const createdIndexes: unknown[] = [];
	const collection = (docs: Record<string, unknown>[]) => ({
		find: (query: Record<string, unknown>) => ({
			toArray: async () =>
				"verified" in query ? docs.filter((d) => d.verified === true) : docs,
		}),
		updateOne: vi.fn(
			async (
				filter: { _id: string },
				update: { $set?: Record<string, unknown> },
			) => {
				const doc = docs.find((d) => d._id === filter._id);
				if (doc && update.$set) Object.assign(doc, update.$set);
			},
		),
		updateMany: vi.fn(
			async (_f: unknown, update: { $unset?: Record<string, unknown> }) => {
				if (update.$unset)
					for (const doc of docs)
						for (const key of Object.keys(update.$unset)) delete doc[key];
			},
		),
		createIndex: vi.fn(async (keys: unknown, options: unknown) => {
			createdIndexes.push({ keys, options });
		}),
	});
	const usersCollection = collection(users);
	const requestsCollection = collection([]);
	return {
		users,
		createdIndexes,
		payload: {
			logger: { info: vi.fn(), error: vi.fn() },
			db: {
				collections: {
					users: { collection: usersCollection },
					"verification-requests": { collection: requestsCollection },
				},
			},
		},
	};
}

describe("p2 verification migration", () => {
	it("records the legacy tick as a date and removes the stored field", async () => {
		const { payload, users } = fakeMongo();
		await up({ payload } as never);
		expect(users[0]).toMatchObject({
			legacyVerifiedAt: new Date("2026-05-01T00:00:00.000Z"),
		});
		expect(users.every((u) => !("verified" in u))).toBe(true);
	});

	it("grants nobody a level", async () => {
		const { payload, users } = fakeMongo();
		await up({ payload } as never);
		expect(users.some((u) => "level" in u || "identityVerifiedAt" in u)).toBe(
			false,
		);
	});

	it("creates the partial unique index that makes one open request per shop and level a database rule", async () => {
		const { payload, createdIndexes } = fakeMongo();
		await up({ payload } as never);
		expect(createdIndexes).toContainEqual({
			keys: { openKey: 1 },
			options: expect.objectContaining({
				unique: true,
				partialFilterExpression: { openKey: { $type: "string" } },
			}),
		});
	});

	it("changes nothing on a second run", async () => {
		const { payload, users } = fakeMongo();
		await up({ payload } as never);
		const after = JSON.parse(JSON.stringify(users));
		await up({ payload } as never);
		expect(JSON.parse(JSON.stringify(users))).toEqual(after);
	});
});
