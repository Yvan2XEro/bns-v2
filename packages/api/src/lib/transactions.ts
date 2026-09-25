import type { Payload, PayloadRequest } from "payload";

export type TxReq = Partial<PayloadRequest>;

/**
 * Runs `fn` in one Payload transaction; every local API call inside must pass
 * the `req` it receives. Without `replicaSet` in DATABASE_URI the adapter
 * returns no transaction id and the writes run unwrapped.
 */
export async function withTransaction<T>(
	payload: Payload,
	fn: (req: TxReq) => Promise<T>,
): Promise<T> {
	const transactionID = (await payload.db?.beginTransaction?.()) ?? undefined;
	const req: TxReq = { payload, transactionID };
	try {
		const result = await fn(req);
		if (transactionID) await payload.db.commitTransaction(transactionID);
		return result;
	} catch (error) {
		if (transactionID) await payload.db.rollbackTransaction(transactionID);
		throw error;
	}
}
