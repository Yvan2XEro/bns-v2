import type { Payload } from "payload";
import { vi } from "vitest";
import { isRecord } from "../../../src/lib/payments/types";

export type Doc = Record<string, unknown>;

const time = (value: unknown): number =>
	value instanceof Date
		? value.getTime()
		: new Date(typeof value === "number" ? value : String(value)).getTime();

function matches(doc: Doc, where: unknown): boolean {
	if (!isRecord(where)) return true;
	return Object.entries(where).every(([field, cond]) => {
		if (field === "and")
			return Array.isArray(cond) && cond.every((w) => matches(doc, w));
		if (field === "or")
			return Array.isArray(cond) && cond.some((w) => matches(doc, w));
		if (!isRecord(cond)) return true;
		const value = doc[field];
		const values = Array.isArray(value) ? value.map(String) : [String(value)];
		if ("equals" in cond) return values.includes(String(cond.equals));
		if ("in" in cond)
			return (
				Array.isArray(cond.in) &&
				cond.in.map(String).some((candidate) => values.includes(candidate))
			);
		if ("exists" in cond) {
			const present = value !== undefined && value !== null;
			return cond.exists ? present : !present;
		}
		if ("less_than" in cond)
			return value != null && time(value) < time(cond.less_than);
		if ("less_than_equal" in cond)
			return value != null && time(value) <= time(cond.less_than_equal);
		if ("greater_than" in cond)
			return value != null && time(value) > time(cond.greater_than);
		return true;
	});
}

interface ByIDArgs {
	collection: string;
	id: unknown;
}
interface FindArgs {
	collection: string;
	where?: unknown;
	limit?: number;
}
interface WriteArgs extends ByIDArgs {
	data: Doc;
}

/**
 * In-memory stand-in for the Payload local API: just the methods the services
 * call. `uniques` declares compound unique keys per collection and makes
 * `create`/`update` fail like Mongo's E11000.
 */
export function fakePayload(
	seed: Record<string, Doc[]> = {},
	options: { uniques?: Record<string, string[][]> } = {},
) {
	const store: Record<string, Doc[]> = {};
	for (const [collection, docs] of Object.entries(seed)) {
		store[collection] = docs.map((doc) => structuredClone(doc));
	}
	let seq = 0;
	const col = (collection: string) => {
		store[collection] ??= [];
		return store[collection];
	};
	const byId = (collection: string, id: unknown) =>
		col(collection).find((doc) => String(doc.id) === String(id));
	const notFound = () => Object.assign(new Error("Not Found"), { status: 404 });

	const checkUnique = (collection: string, candidate: Doc) => {
		for (const fields of options.uniques?.[collection] ?? []) {
			if (
				fields.some((f) => candidate[f] === undefined || candidate[f] === null)
			)
				continue;
			const clash = col(collection).some(
				(doc) =>
					doc.id !== candidate.id &&
					fields.every((f) => String(doc[f]) === String(candidate[f])),
			);
			if (clash) {
				throw Object.assign(
					new Error(`E11000 duplicate key in ${collection}`),
					{
						code: 11000,
					},
				);
			}
		}
	};

	const payload = {
		store,
		logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		jobs: { queue: vi.fn(async () => ({ id: `job-${++seq}` })) },
		auth: vi.fn(async () => ({ user: null })),
		async findByID({ collection, id }: ByIDArgs) {
			const doc = byId(collection, id);
			if (!doc) throw notFound();
			return structuredClone(doc);
		},
		async find({ collection, where, limit }: FindArgs) {
			let docs = col(collection).filter((doc) => matches(doc, where));
			const totalDocs = docs.length;
			if (typeof limit === "number" && limit > 0) docs = docs.slice(0, limit);
			return {
				docs: docs.map((doc) => structuredClone(doc)),
				totalDocs,
				hasNextPage: false,
				nextPage: null,
			};
		},
		async create({ collection, data }: Omit<WriteArgs, "id">) {
			const now = new Date().toISOString();
			const doc: Doc = {
				id: `${collection}-${++seq}`,
				createdAt: now,
				updatedAt: now,
				...structuredClone(data),
			};
			checkUnique(collection, doc);
			col(collection).push(doc);
			return structuredClone(doc);
		},
		async update({ collection, id, data }: WriteArgs) {
			const doc = byId(collection, id);
			if (!doc) throw notFound();
			const next: Doc = {
				...doc,
				...structuredClone(data),
				updatedAt: new Date().toISOString(),
			};
			checkUnique(collection, next);
			Object.assign(doc, next);
			return structuredClone(doc);
		},
		async delete({ collection, id }: ByIDArgs) {
			const list = col(collection);
			const index = list.findIndex((doc) => String(doc.id) === String(id));
			if (index < 0) throw notFound();
			return list.splice(index, 1)[0];
		},
	};

	// The services call this through the Payload signatures; the fake only has
	// to behave the same at runtime.
	return payload as unknown as Payload & typeof payload;
}

export type FakePayload = ReturnType<typeof fakePayload>;
