import type { Payload, PayloadRequest } from "payload";

/** P0's type, kept for its callers. */
export type TxReq = Partial<PayloadRequest>;

type AfterCommit = () => unknown;

const AFTER_COMMIT = "afterCommit";

/**
 * Queues work that other processes observe (Redis, Novu) until the current
 * transaction commits. Returns false when `req` is not inside `withTransaction`,
 * so callers can run the work immediately instead.
 */
export function onCommit(
	req: { context?: Record<string, unknown> } | undefined | null,
	callback: AfterCommit,
): boolean {
	const queue = req?.context?.[AFTER_COMMIT];
	if (!Array.isArray(queue)) return false;
	queue.push(callback);
	return true;
}

function isTransient(error: unknown): boolean {
	const e = error as {
		errorLabels?: unknown;
		hasErrorLabel?: (label: string) => boolean;
		code?: unknown;
	} | null;
	if (!e) return false;
	if (
		typeof e.hasErrorLabel === "function" &&
		e.hasErrorLabel("TransientTransactionError")
	) {
		return true;
	}
	return (
		(Array.isArray(e.errorLabels) &&
			e.errorLabels.includes("TransientTransactionError")) ||
		e.code === 112
	);
}

/**
 * Runs `fn` with one request object shared by every local API call, inside a
 * Mongo transaction when the adapter has one (P0 replica set). Concurrent
 * writers to the same document make Mongo abort one transaction with a
 * transient error; retrying re-reads the new state, which is what keeps
 * conditional stock updates correct under contention.
 *
 * Context passed to local API calls is merged into this shared req, so service
 * flags set on one call stay set for the rest of the transaction. That is
 * intended: everything inside is service code.
 */
export async function withTransaction<T>(
	payload: Payload,
	fn: (req: PayloadRequest) => Promise<T>,
	options: {
		user?: unknown;
		context?: Record<string, unknown>;
		attempts?: number;
	} = {},
): Promise<T> {
	const attempts = options.attempts ?? 3;

	for (let attempt = 1; ; attempt++) {
		const afterCommit: AfterCommit[] = [];
		const req = {
			payload,
			user: options.user ?? null,
			context: { ...(options.context ?? {}), [AFTER_COMMIT]: afterCommit },
		} as unknown as PayloadRequest;

		const db = payload.db as Partial<Payload["db"]> | undefined;
		const transactionID =
			typeof db?.beginTransaction === "function"
				? await db.beginTransaction()
				: null;
		if (transactionID) req.transactionID = transactionID;

		try {
			const result = await fn(req);
			if (transactionID && db?.commitTransaction)
				await db.commitTransaction(transactionID);
			for (const callback of afterCommit) {
				try {
					await callback();
				} catch (error) {
					console.error("[transaction] after-commit callback failed", error);
				}
			}
			return result;
		} catch (error) {
			if (transactionID && db?.rollbackTransaction) {
				await db.rollbackTransaction(transactionID).catch(() => undefined);
			}
			if (attempt < attempts && isTransient(error)) continue;
			throw error;
		}
	}
}
