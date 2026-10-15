import { ObjectId } from "mongodb";
import type { FakePayload } from "./fakePayload";

type Doc = Record<string, unknown>;

const plain = (value: unknown): unknown => {
	if (value instanceof ObjectId) return value.toHexString();
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map(plain);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, plain(v)]),
		);
	return value;
};

function at(doc: Doc, path: string): unknown {
	return path
		.split(".")
		.reduce<unknown>(
			(cur, key) =>
				cur && typeof cur === "object" ? (cur as Doc)[key] : undefined,
			doc,
		);
}

function put(doc: Doc, path: string, value: unknown): void {
	const keys = path.split(".");
	let cur = doc;
	for (const key of keys.slice(0, -1)) {
		if (!cur[key] || typeof cur[key] !== "object") cur[key] = {};
		cur = cur[key] as Doc;
	}
	cur[keys[keys.length - 1]] = value;
}

function drop(doc: Doc, path: string): void {
	const keys = path.split(".");
	const parent = at(doc, keys.slice(0, -1).join("."));
	const target = keys.length === 1 ? doc : parent;
	if (target && typeof target === "object")
		delete (target as Doc)[keys[keys.length - 1]];
}

function hit(doc: Doc, filter: Doc): boolean {
	return Object.entries(filter).every(([path, cond]) => {
		const value = at(doc, path === "_id" ? "id" : path);
		if (cond === null) return value == null;
		if (cond && typeof cond === "object" && "$exists" in cond)
			return (value !== undefined) === cond.$exists;
		return String(plain(value)) === String(plain(cond));
	});
}

/**
 * The slice of the Mongo adapter the P10 migration writes through, over the
 * same in-memory store the local API reads, so what the migration inserts is
 * what the loader later hydrates.
 */
export function withRawMongo(api: FakePayload): FakePayload {
	const table = (slug: string) => {
		api.store[slug] ??= [];
		return api.store[slug];
	};
	const apply = (row: Doc, update: { $set?: Doc; $unset?: Doc }) => {
		for (const [k, v] of Object.entries(update.$set ?? {}))
			put(row, k, plain(v));
		for (const k of Object.keys(update.$unset ?? {})) drop(row, k);
	};
	const collection = (slug: string) => ({
		async insertOne(doc: Doc) {
			const { _id, ...rest } = plain(doc) as Doc;
			table(slug).push({ id: _id, ...rest });
		},
		/** A cursor over copies, as the driver hands out; `_id` mirrors `id`. */
		find(filter: Doc = {}) {
			const rows = table(slug)
				.filter((d) => hit(d, filter))
				.map((d) => ({ _id: d.id, ...structuredClone(d) }));
			return {
				async *[Symbol.asyncIterator]() {
					yield* rows;
				},
			};
		},
		async updateOne(filter: Doc, update: { $set?: Doc; $unset?: Doc }) {
			const row = table(slug).find((d) => hit(d, filter));
			if (row) apply(row, update);
		},
		async updateMany(filter: Doc, update: { $set?: Doc; $unset?: Doc }) {
			for (const row of table(slug).filter((d) => hit(d, filter)))
				apply(row, update);
		},
	});
	const collections = new Proxy(
		{},
		{ get: (_, slug: string) => ({ collection: collection(slug) }) },
	);
	Object.assign(api.db, {
		collections,
		globals: {
			async updateOne(_filter: Doc, update: { $set: Doc }) {
				api.globals["app-settings"] ??= {};
				const global = api.globals["app-settings"];
				for (const [k, v] of Object.entries(update.$set)) put(global, k, v);
			},
		},
	});
	return api;
}
