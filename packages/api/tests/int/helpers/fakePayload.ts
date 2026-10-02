import type { Payload } from "payload";
import { vi } from "vitest";

export type Doc = Record<string, unknown>;

interface Options {
	/** Compound unique keys per collection, e.g. `{ shops: [["handle"]] }`. */
	uniques?: Record<string, string[][]>;
	globals?: Record<string, Doc>;
	/** `payload.config.secret`, read by services that salt a hash with it
	 * (`req.payload.config.secret` rather than `process.env.PAYLOAD_SECRET`,
	 * so a test can set its own and assert the hash is reproducible from it). */
	secret?: string;
}

type Undo = { collection: string; id: string; before: Doc | null };

type Req = { context?: Doc; transactionID?: string } | undefined;

/** The union of every option the services pass; the fake reads what it needs. */
interface Args {
	collection: string;
	context?: Doc;
	data?: Doc;
	id?: unknown;
	limit?: number;
	page?: number;
	pagination?: boolean;
	req?: Req;
	slug?: string;
	sort?: unknown;
	where?: Doc;
}

const idOf = (value: unknown): unknown =>
	value && typeof value === "object" && "id" in (value as Doc)
		? (value as Doc).id
		: value;

function collect(value: unknown, parts: string[]): unknown[] {
	if (parts.length === 0) return Array.isArray(value) ? value : [value];
	if (Array.isArray(value))
		return value.flatMap((item) => collect(item, parts));
	if (value && typeof value === "object") {
		return collect((value as Doc)[parts[0]], parts.slice(1));
	}
	return [undefined];
}

const comparable = (value: unknown): number | string => {
	if (typeof value === "number") return value;
	if (
		typeof value === "string" &&
		!Number.isNaN(Date.parse(value)) &&
		/\d{4}-\d{2}-\d{2}/.test(value)
	) {
		return Date.parse(value);
	}
	return value as string;
};

function testCondition(
	values: unknown[],
	op: string,
	expected: unknown,
): boolean {
	const ids = values.map(idOf);
	switch (op) {
		case "equals":
			if (expected === null)
				return ids.every((v) => v === null || v === undefined);
			return ids.some((v) => String(v) === String(expected));
		case "not_equals":
			return !ids.some((v) => String(v) === String(expected));
		case "in":
			return ids.some((v) =>
				(expected as unknown[]).map(String).includes(String(v)),
			);
		case "not_in":
			return !ids.some((v) =>
				(expected as unknown[]).map(String).includes(String(v)),
			);
		case "exists":
			return expected
				? ids.some((v) => v !== undefined && v !== null)
				: ids.every((v) => v === undefined || v === null);
		case "greater_than":
			return ids.some((v) => v != null && comparable(v) > comparable(expected));
		case "greater_than_equal":
			return ids.some(
				(v) => v != null && comparable(v) >= comparable(expected),
			);
		case "less_than":
			return ids.some((v) => v != null && comparable(v) < comparable(expected));
		case "less_than_equal":
			return ids.some(
				(v) => v != null && comparable(v) <= comparable(expected),
			);
		case "contains":
		case "like":
			return ids.some((v) =>
				String(v ?? "")
					.toLowerCase()
					.includes(String(expected).toLowerCase()),
			);
		default:
			throw new Error(`fakePayload: unsupported operator ${op}`);
	}
}

export function matches(doc: Doc, where: Doc | undefined): boolean {
	if (!where) return true;
	return Object.entries(where).every(([key, condition]) => {
		if (key === "and")
			return (condition as Doc[]).every((w) => matches(doc, w));
		if (key === "or") return (condition as Doc[]).some((w) => matches(doc, w));
		const values = collect(doc, key.split("."));
		return Object.entries(condition as Doc).every(([op, expected]) =>
			testCondition(values, op, expected),
		);
	});
}

function sortDocs(docs: Doc[], sort: unknown): Doc[] {
	if (typeof sort !== "string" || !sort) return docs;
	const desc = sort.startsWith("-");
	const field = desc ? sort.slice(1) : sort;
	return [...docs].sort((a, b) => {
		const av = comparable(a[field] ?? "");
		const bv = comparable(b[field] ?? "");
		if (av === bv) return 0;
		return (av > bv ? 1 : -1) * (desc ? -1 : 1);
	});
}

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Mirrors `createLocalReq`'s `getRequestContext`: every local API call
 * reassigns `req.context` in place to the merge of what was already there
 * and whatever `context` this call carries (defaulting to `{}`), rather
 * than leaving the caller's object untouched. A caller that threads the
 * same `req` through several calls — `withTransaction`'s whole point — sees
 * a flag set on one call still set on the next, whether that call asked for
 * it or not. That is the real behaviour a service relying on isolation
 * between calls on a shared `req` would be wrong to assume.
 */
function applyRequestContext(req: Req, context: Doc | undefined): void {
	if (!req || typeof req !== "object") return;
	const target = req as { context?: Doc };
	const incoming = context ?? {};
	target.context =
		target.context && Object.keys(target.context).length > 0
			? { ...target.context, ...incoming }
			: incoming;
}

/**
 * In-memory stand-in for the Payload local API: just the methods the services
 * call. `uniques` declares compound unique keys per collection and makes
 * `create`/`update` fail like Mongo's E11000.
 *
 * `db.beginTransaction`/`commitTransaction`/`rollbackTransaction` keep a
 * per-transaction undo journal of every write that carried the transaction's
 * `req`: a real `replicaSet` deployment gets this from Mongo itself, and
 * `withTransaction` (lib/transactions.ts) runs unwrapped without one — this
 * fake is the one place tests can see that a rollback actually undoes every
 * write a transaction made, not just some of them.
 */
export function fakePayload(
	seed: Record<string, Doc[]> = {},
	options: Options = {},
) {
	const store: Record<string, Doc[]> = {};
	for (const [collection, docs] of Object.entries(seed))
		store[collection] = clone(docs);
	const globals: Record<string, Doc> = clone(options.globals ?? {});
	const journals = new Map<string, Undo[]>();
	const writes: Array<{
		op: string;
		collection: string;
		id: string;
		data?: Doc;
		context?: Doc;
		transactionID?: string;
	}> = [];
	const reads: Array<{ collection: string; id?: string; where?: Doc }> = [];
	let seq = 0;
	let txSeq = 0;
	let lastStamp = 0;
	/** Follows `Date` (P0 tests fake it) but never repeats, so `sort: "-createdAt"` is deterministic. */
	const stamp = () => {
		lastStamp = Math.max(Date.now(), lastStamp + 1);
		return new Date(lastStamp).toISOString();
	};

	const table = (collection: string): Doc[] => {
		store[collection] ??= [];
		return store[collection];
	};
	const byId = (collection: string, id: unknown): Doc | undefined =>
		table(collection).find((doc) => String(doc.id) === String(id));
	const notFound = () => Object.assign(new Error("Not Found"), { status: 404 });

	const journal = (
		req: Req,
		collection: string,
		id: unknown,
		before: Doc | null,
	) => {
		const txId = req?.transactionID;
		if (txId && journals.has(txId))
			journals.get(txId)?.push({ collection, id: String(id), before });
	};

	const assertUnique = (collection: string, doc: Doc) => {
		for (const fields of options.uniques?.[collection] ?? []) {
			if (fields.some((f) => doc[f] === undefined || doc[f] === null)) continue;
			const clash = table(collection).some(
				(other) =>
					other.id !== doc.id &&
					fields.every((f) => String(other[f]) === String(doc[f])),
			);
			if (clash) {
				throw Object.assign(
					new Error(`E11000 duplicate key in ${collection}`),
					{ code: 11000 },
				);
			}
		}
	};

	// A minimal stand-in for `payload.collections[slug].config`, generic across
	// every slug: no `afterDelete` hooks (no cloud-storage plugin wired up) and
	// no `staticDir` (nothing to unlink), so a caller reading either — the way
	// `purgeDocumentFiles` does to drop a file without deleting its row — gets
	// an empty, harmless config instead of `undefined`.
	const collectionConfigStub = {
		config: {
			hooks: { afterDelete: [] as unknown[] },
			upload: { staticDir: undefined },
		},
	};
	const collections = new Proxy(
		{},
		{ get: () => collectionConfigStub },
	) as Record<string, typeof collectionConfigStub>;

	const payload = {
		store,
		globals,
		writes,
		collections,
		reads,
		config: { secret: options.secret ?? "fake-payload-test-secret" },
		/** Return true to make the matching call throw, to test rollbacks. */
		failWhen: null as null | ((method: string, args: Args) => boolean),
		logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		jobs: { queue: vi.fn(async () => ({ id: `job-${++seq}` })) },
		auth: vi.fn(async () => ({ user: null as unknown })),
		maybeFail(method: string, args: Args) {
			if (payload.failWhen?.(method, args))
				throw new Error(`forced failure: ${method}`);
		},
		async findByID(args: Args) {
			payload.maybeFail("findByID", args);
			const { collection, id, req, context } = args;
			applyRequestContext(req, context);
			reads.push({ collection, id: String(id) });
			const doc = byId(collection, id);
			if (!doc) throw notFound();
			return clone(doc);
		},
		async find(findArgs: Args) {
			payload.maybeFail("find", findArgs);
			const {
				collection,
				where,
				sort,
				limit,
				page = 1,
				pagination,
				req,
				context,
			} = findArgs;
			applyRequestContext(req, context);
			reads.push({ collection, where });
			const all = sortDocs(
				table(collection).filter((d) => matches(d, where)),
				sort,
			);
			const unlimited = !limit || pagination === false;
			const size = unlimited ? all.length || 1 : limit;
			const start = unlimited ? 0 : (page - 1) * size;
			const docs = unlimited ? all : all.slice(start, start + size);
			const totalPages = Math.max(1, Math.ceil(all.length / size));
			return {
				docs: docs.map(clone),
				totalDocs: all.length,
				page,
				totalPages,
				hasNextPage: page < totalPages,
				nextPage: page < totalPages ? page + 1 : null,
			};
		},
		async count(args: Args) {
			payload.maybeFail("count", args);
			const { collection, where, req, context } = args;
			applyRequestContext(req, context);
			return {
				totalDocs: table(collection).filter((d) => matches(d, where)).length,
			};
		},
		async create(args: Args) {
			const { collection, data, req, context } = args;
			applyRequestContext(req, context);
			payload.maybeFail("create", args);
			seq += 1;
			const now = stamp();
			const doc: Doc = {
				id: `${collection}-${seq}`,
				createdAt: now,
				updatedAt: now,
				...clone(data ?? {}),
			};
			assertUnique(collection, doc);
			table(collection).push(doc);
			journal(req, collection, doc.id, null);
			writes.push({
				op: "create",
				collection,
				id: String(doc.id),
				data,
				context,
				transactionID: req?.transactionID,
			});
			return clone(doc);
		},
		async update(args: Args) {
			const { collection, id, where, data, req, context } = args;
			applyRequestContext(req, context);
			payload.maybeFail("update", args);
			const apply = (doc: Doc) => {
				const before = clone(doc);
				const next = { ...doc, ...clone(data ?? {}), updatedAt: stamp() };
				assertUnique(collection, next);
				Object.assign(doc, next);
				journal(req, collection, doc.id, before);
				writes.push({
					op: "update",
					collection,
					id: String(doc.id),
					data,
					context,
					transactionID: req?.transactionID,
				});
				return clone(doc);
			};
			// Payload's bulk update finds and then writes by id
			// (`collections/operations/update.js`), so the predicate is gone by
			// the time it writes. The await reproduces that window: a caller that
			// relies on `where` to serialise two racers has to fail here.
			if (id === undefined) {
				const matched = table(collection).filter((d) => matches(d, where));
				await Promise.resolve();
				return { docs: matched.map(apply), errors: [] };
			}
			const doc = byId(collection, id);
			if (!doc) throw notFound();
			return apply(doc);
		},
		async delete(args: Args) {
			const { collection, id, req, context } = args;
			applyRequestContext(req, context);
			payload.maybeFail("delete", args);
			const rows = table(collection);
			const index = rows.findIndex((d) => String(d.id) === String(id));
			if (index < 0) throw notFound();
			const [removed] = rows.splice(index, 1);
			journal(req, collection, removed.id, removed);
			writes.push({
				op: "delete",
				collection,
				id: String(removed.id),
				context,
				transactionID: req?.transactionID,
			});
			return clone(removed);
		},
		async findGlobal(args: Args) {
			payload.maybeFail("findGlobal", args);
			return clone(globals[String(args.slug)] ?? {});
		},
		db: {
			async beginTransaction() {
				const id = `tx-${++txSeq}`;
				journals.set(id, []);
				return id;
			},
			async commitTransaction(id: string) {
				journals.delete(id);
			},
			async rollbackTransaction(id: string) {
				const undo = journals.get(id) ?? [];
				journals.delete(id);
				for (const entry of undo.reverse()) {
					const rows = table(entry.collection);
					const index = rows.findIndex((d) => String(d.id) === entry.id);
					if (entry.before === null) {
						if (index >= 0) rows.splice(index, 1);
					} else if (index >= 0) {
						rows[index] = entry.before;
					} else {
						rows.push(entry.before);
					}
				}
			},
			/** Mirrors the Mongo adapter: one `findOneAndUpdate` by `where` or `id`, `$inc` support, null when nothing matches. */
			async updateOne(args: Args) {
				const { collection, id, where, data, req } = args;
				payload.maybeFail("db.updateOne", args);
				const doc =
					id === undefined
						? table(collection).find((d) => matches(d, where))
						: byId(collection, id);
				if (!doc) return null;
				const before = clone(doc);
				const next: Doc = { ...doc };
				for (const [key, value] of Object.entries(data ?? {})) {
					if (value && typeof value === "object" && "$inc" in value) {
						next[key] = Number(next[key] ?? 0) + Number(value.$inc);
					} else {
						next[key] = clone(value);
					}
				}
				next.updatedAt = stamp();
				assertUnique(collection, next);
				Object.assign(doc, next);
				journal(req, collection, doc.id, before);
				writes.push({
					op: "db.updateOne",
					collection,
					id: String(doc.id),
					data,
					transactionID: req?.transactionID,
				});
				return clone(doc);
			},
		},
	};

	// The services call this through the Payload signatures; the fake only has
	// to behave the same at runtime.
	return payload as unknown as Payload & typeof payload;
}

export type FakePayload = ReturnType<typeof fakePayload>;
