import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";
import { rowStripDueAt } from "../lib/verificationRetention";
import { TERMINAL_STATUSES } from "../lib/verificationTransitions";

const raw = (payload: MigrateUpArgs["payload"], slug: string) =>
	(payload.db as unknown as MongooseAdapter).collections[slug].collection;

/**
 * One-off backfill for P2 final-review findings the fix in the same commit
 * only changes the behaviour of going forward:
 *
 * - `kyc.faceMatchScore` was stored as the vendor's own 0..1 fraction against
 *   a field declared `min: 0, max: 100` (fixed in `lib/kyc/didit.ts`); every
 *   row written before that fix still holds the fraction, and a 97 % match
 *   reads as "approximately 1" to a reviewer until this runs.
 * - `business.niu` was never upper-cased server-side (fixed in the business
 *   route), so a row written by a caller that skipped the client's own
 *   upper-casing can still be lowercase, defeating the `niu_reused`
 *   duplicate-detection pre-filter's exact-match query.
 * - the nightly row strip never cleared `kyc.vendorWarnings` (fixed in
 *   `jobs/purgeVerificationData.ts`); a request already past its five-year
 *   row-strip date when this ships needs the catch-up the fixed job only
 *   applies from here on.
 * - `verification-documents.originalFilename` was never cleared when a
 *   document's bytes were purged (fixed in `services/verificationDocuments.ts`);
 *   a document already purged before that fix still carries it.
 *
 * Every step scans its whole collection rather than filtering server-side:
 * these are one-off catch-ups over collections this product does not expect
 * to be enormous, and the nightly jobs they mirror (`findTerminal`) already
 * take the same "fetch, then filter in code" shape.
 */
export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const requests = raw(payload, "verification-requests");
	const allRequests = await requests.find({}).toArray();

	let faceMatchScoreFixed = 0;
	for (const doc of allRequests) {
		const score = doc.kyc?.faceMatchScore;
		if (typeof score !== "number" || score <= 0 || score > 1) continue;
		await requests.updateOne(
			{ _id: doc._id },
			{ $set: { "kyc.faceMatchScore": Math.round(score * 100) } },
		);
		faceMatchScoreFixed += 1;
	}

	let niuUppercased = 0;
	for (const doc of allRequests) {
		const niu = doc.business?.niu;
		if (typeof niu !== "string") continue;
		const upper = niu.toUpperCase();
		if (upper === niu) continue;
		await requests.updateOne(
			{ _id: doc._id },
			{ $set: { "business.niu": upper } },
		);
		niuUppercased += 1;
	}

	const now = new Date();
	let vendorWarningsCleared = 0;
	for (const doc of allRequests) {
		if (
			!doc.status ||
			!(TERMINAL_STATUSES as readonly string[]).includes(doc.status)
		) {
			continue;
		}
		if (doc.kyc?.vendorWarnings == null) continue;
		const due = rowStripDueAt({
			status: doc.status,
			updatedAt: doc.updatedAt ?? now,
			statusHistory: doc.statusHistory,
		});
		if (!due || due.getTime() > now.getTime()) continue;
		await requests.updateOne(
			{ _id: doc._id },
			{ $set: { "kyc.vendorWarnings": null } },
		);
		vendorWarningsCleared += 1;
	}

	const documents = raw(payload, "verification-documents");
	const allDocuments = await documents.find({}).toArray();
	let originalFilenameCleared = 0;
	for (const doc of allDocuments) {
		if (doc.purgedAt == null || doc.originalFilename == null) continue;
		await documents.updateOne(
			{ _id: doc._id },
			{ $set: { originalFilename: null } },
		);
		originalFilenameCleared += 1;
	}

	payload.logger.info({
		msg: "[migration] backfilled faceMatchScore units, niu casing, overdue vendorWarnings and purged documents' originalFilename",
		faceMatchScoreFixed,
		niuUppercased,
		vendorWarningsCleared,
		originalFilenameCleared,
	});
}

export async function down(_args: MigrateDownArgs): Promise<void> {
	// Not reversible: the original 0..1 fraction, the original niu casing and
	// the cleared warning/filename text are gone, the same way
	// `20260930_000000_p2_verification_levels`'s `down` does not restore
	// `users.verified` once it has been folded into `legacyVerifiedAt`.
}
