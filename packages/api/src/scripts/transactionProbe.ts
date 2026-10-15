/**
 * Proves multi-document transactions are live: writes to two collections in
 * one transaction, aborts it, and checks that neither write survived.
 *
 * It proves the rollback half only: a transaction that commits is never
 * exercised here, because rollback is what tells a real transaction apart from
 * Payload's no-op fallback, which cannot undo anything.
 *
 * Usage (from packages/api): bun run src/scripts/transactionProbe.ts
 * Exits 1 when DATABASE_URI has no replicaSet (transactions disabled) or when
 * an aborted write is visible.
 */
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../payload.config";

const payload = await getPayload({ config });
const marker = `tx-probe-${randomUUID()}`;

// On a fresh database Mongoose creates these collections and builds their
// indexes in the background; a transaction that writes while that catalog
// change is in flight is refused, which on a slow CI runner it always was.
await Promise.all(
	["tags", "webhook-events"].map((slug) => payload.db.collections[slug].init()),
);

const transactionID = await payload.db.beginTransaction();
if (!transactionID) {
	payload.logger.error(
		"Transactions are disabled: DATABASE_URI has no replicaSet option.",
	);
	process.exit(1);
}

const req = { transactionID };
try {
	await payload.create({
		collection: "tags",
		data: { name: marker, slug: marker },
		overrideAccess: true,
		req,
	});
	await payload.create({
		collection: "webhook-events",
		data: {
			provider: "notchpay",
			providerEventId: marker,
			type: "transaction-probe",
			payloadHash: marker,
			raw: {},
			receivedAt: new Date().toISOString(),
			attempts: 0,
		},
		overrideAccess: true,
		req,
	});
} catch (error) {
	const { codeName, message } = error as { codeName?: string; message: string };
	payload.logger.error(
		`Transaction probe could not write: ${codeName ?? "error"}: ${message}`,
	);
	process.exit(1);
} finally {
	await payload.db.rollbackTransaction(transactionID);
}

const leaked =
	(
		await payload.count({
			collection: "tags",
			where: { slug: { equals: marker } },
			overrideAccess: true,
		})
	).totalDocs +
	(
		await payload.count({
			collection: "webhook-events",
			where: { providerEventId: { equals: marker } },
			overrideAccess: true,
		})
	).totalDocs;

if (leaked > 0) {
	payload.logger.error(
		`Transaction probe failed: ${leaked} aborted write(s) are visible.`,
	);
	process.exit(1);
}
payload.logger.info(
	"Transaction probe passed: the aborted writes left no trace.",
);
process.exit(0);
