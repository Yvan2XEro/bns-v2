import type { Payload, PayloadRequest } from "payload";

/** P0's type, kept for its callers. */
export type TxReq = Partial<PayloadRequest>;

type AfterCommit = () => unknown;

const AFTER_COMMIT = "afterCommit";
/** The transaction the queue belongs to; see `afterCommitScope`. */
const AFTER_COMMIT_TX = "afterCommitTransactionID";

/** First back-off between body retries; doubled per attempt and jittered. */
const RETRY_BASE_MS = 25;
/** Mongo's advice on a lost commit acknowledgement is to retry the commit. */
const COMMIT_ATTEMPTS = 3;

type TransactionID = number | string;

type TxAdapter = {
	beginTransaction?: () => Promise<TransactionID | null | undefined>;
	commitTransaction?: (id: TransactionID) => Promise<void>;
	rollbackTransaction?: (id: TransactionID) => Promise<void>;
};

type CommitContext = {
	context?: Record<string, unknown>;
	transactionID?: TransactionID;
};

/**
 * Where a `req` stands relative to an after-commit queue:
 *
 * - `queued`  — it comes from `withTransaction`, which owns the transaction and
 *   will drain the queue once the commit lands.
 * - `foreign` — it carries someone else's transaction. Payload's mongoose
 *   adapter opens one per REST and Local API operation, so a listing saved from
 *   the admin panel reaches `afterChange` with a `transactionID` this helper
 *   never opened.
 * - `none`    — no transaction at all.
 */
export type CommitScope = "foreign" | "none" | "queued";

export function afterCommitScope(
	req: CommitContext | undefined | null,
): CommitScope {
	const context = req?.context;
	const owner = context?.[AFTER_COMMIT_TX];
	if (
		Array.isArray(context?.[AFTER_COMMIT]) &&
		owner === (req?.transactionID ?? null)
	) {
		return "queued";
	}
	return req?.transactionID ? "foreign" : "none";
}

/**
 * Queues work that other processes observe (Redis, Novu) until the current
 * transaction commits.
 *
 * Returns false for both `none` and `foreign`, so callers run the work
 * immediately. That is exact for `none`. For `foreign` it is a deliberate
 * fallback: the adapter exposes no hook that fires after *its* commit, and
 * nothing in Payload's API lets a caller join a transaction it did not open.
 * The cost is the narrow window this helper exists to close — an admin-panel
 * save can publish its search event a few milliseconds before Payload commits,
 * so the indexer may re-read the pre-commit document. It self-heals on the next
 * event for that document, and every P1 write goes through `withTransaction`,
 * where the ordering is guaranteed. Running the work late but ordered is not on
 * offer; dropping it entirely would lose the event for good.
 */
export function onCommit(
	req: CommitContext | undefined | null,
	callback: AfterCommit,
): boolean {
	if (afterCommitScope(req) !== "queued") return false;
	(req?.context?.[AFTER_COMMIT] as AfterCommit[]).push(callback);
	return true;
}

function hasErrorLabel(error: unknown, label: string): boolean {
	if (!error || typeof error !== "object") return false;
	const e = error as {
		errorLabels?: unknown;
		hasErrorLabel?: (label: string) => boolean;
	};
	if (typeof e.hasErrorLabel === "function" && e.hasErrorLabel(label)) {
		return true;
	}
	return Array.isArray(e.errorLabels) && e.errorLabels.includes(label);
}

/** Mongo aborted this transaction; re-running the body re-reads the new state. */
function isTransient(error: unknown): boolean {
	if (hasErrorLabel(error, "TransientTransactionError")) return true;
	return (
		typeof error === "object" &&
		error !== null &&
		(error as { code?: unknown }).code === 112
	);
}

/** The commit may have landed: the acknowledgement, not the write, was lost. */
function isUnknownCommitResult(error: unknown): boolean {
	return hasErrorLabel(error, "UnknownTransactionCommitResult");
}

/** Exponential back-off with jitter, so two racing writers stop retrying in step. */
function backoff(attempt: number): Promise<void> {
	const ceiling = RETRY_BASE_MS * 2 ** (attempt - 1);
	const delay = Math.round(ceiling * (0.5 + Math.random()));
	return new Promise((resolve) => setTimeout(resolve, delay));
}

async function rollback(
	payload: Payload,
	db: TxAdapter | undefined,
	transactionID: TransactionID | null,
): Promise<void> {
	if (!transactionID || typeof db?.rollbackTransaction !== "function") return;
	try {
		await db.rollbackTransaction(transactionID);
	} catch (error) {
		// The body already failed and its error is the one the caller needs, but
		// a rollback that fails leaves a transaction open on the server: say so.
		payload.logger.error(
			{ err: error, transactionID },
			"[transaction] rollback failed",
		);
	}
}

/**
 * Commits, retrying only the commit. `UnknownTransactionCommitResult` means the
 * server may already have committed, so the body must never run again and the
 * transaction must never be rolled back from here; `commitTransaction` is
 * idempotent, which is what makes retrying it the documented recovery.
 */
async function commit(
	payload: Payload,
	commitTransaction: (id: TransactionID) => Promise<void>,
	transactionID: TransactionID,
): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		try {
			await commitTransaction(transactionID);
			return;
		} catch (error) {
			if (attempt < COMMIT_ATTEMPTS && isUnknownCommitResult(error)) {
				await backoff(attempt);
				continue;
			}
			if (isUnknownCommitResult(error)) {
				// Out of retries with the outcome still unknown. The after-commit
				// work is skipped: the caller is told the transaction failed, and
				// a caller that believes that must not also see its side effects.
				// Re-running the operation republishes them if the writes landed.
				payload.logger.error(
					{ err: error, transactionID },
					"[transaction] commit result still unknown after retries; after-commit work skipped",
				);
			}
			throw error;
		}
	}
}

async function runAfterCommit(
	payload: Payload,
	queue: AfterCommit[],
): Promise<void> {
	for (const callback of queue) {
		try {
			await callback();
		} catch (error) {
			payload.logger.error(
				{ err: error },
				"[transaction] after-commit callback failed",
			);
		}
	}
}

/**
 * Runs `fn` with one request object shared by every local API call, inside a
 * Mongo transaction when the adapter has one (P0 replica set). Concurrent
 * writers to the same document make Mongo abort one transaction with a
 * transient error; retrying re-reads the new state, which is what keeps
 * conditional stock updates correct under contention.
 *
 * The body and the commit are separate phases. Only the body is retried: once
 * the commit has been attempted the writes may be durable, so re-running the
 * body would apply it twice and rolling back would undo a committed
 * transaction.
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
	const db = payload.db as TxAdapter | undefined;

	for (let attempt = 1; ; attempt++) {
		const afterCommit: AfterCommit[] = [];
		const transactionID =
			(typeof db?.beginTransaction === "function"
				? await db.beginTransaction()
				: null) ?? null;

		let commitTransaction: ((id: TransactionID) => Promise<void>) | null = null;
		if (transactionID) {
			if (typeof db?.commitTransaction !== "function") {
				// An adapter that opens transactions it cannot commit would leave
				// every write dangling while the after-commit work fired as if it
				// had succeeded. Fail before the body writes anything.
				await rollback(payload, db, transactionID);
				throw new Error(
					"[transaction] the database adapter opens transactions but cannot commit them",
				);
			}
			commitTransaction = db.commitTransaction.bind(db);
		}

		const req = {
			payload,
			user: options.user ?? null,
			context: {
				...(options.context ?? {}),
				[AFTER_COMMIT]: afterCommit,
				[AFTER_COMMIT_TX]: transactionID,
			},
		} as unknown as PayloadRequest;
		if (transactionID) req.transactionID = transactionID;

		let result: T;
		try {
			result = await fn(req);
		} catch (error) {
			await rollback(payload, db, transactionID);
			if (attempt < attempts && isTransient(error)) {
				await backoff(attempt);
				continue;
			}
			throw error;
		}

		// Commit phase: past here the body never runs again and nothing is rolled
		// back, because the commit may already have landed.
		if (commitTransaction && transactionID) {
			await commit(payload, commitTransaction, transactionID);
		}
		await runAfterCommit(payload, afterCommit);
		return result;
	}
}
