import type { Payload, TaskConfig } from "payload";
import { getKycProvider } from "../lib/kyc";
import { relationId } from "../lib/relationId";
import { withTransaction } from "../lib/transactions";
import {
	documentPurgeDueAt,
	RETENTION,
	rowStripDueAt,
	vendorDeletionDueAt,
} from "../lib/verificationRetention";
import { TERMINAL_STATUSES } from "../lib/verificationTransitions";
import type { VerificationRequest } from "../payload-types";
import { writeShop } from "../services/shops";
import {
	expireRequest,
	releaseRequest,
	VERIFICATION_CONTEXT,
} from "../services/verification";
import { purgeDocumentFiles } from "../services/verificationDocuments";
import { notifyVerificationExpiring } from "../services/verificationNotifications";

export interface PurgeReport {
	filesPurged: string[];
	rowsStripped: string[];
	vendorDeleted: string[];
	vendorRetried: string[];
	viewsDeleted: number;
	expiringNotified: string[];
}

const DAY_MS = 86_400_000;

/** System actor for the release lever: `releaseRequest` ignores it entirely once `system: true` is set. */
const SYSTEM_ACTOR = { id: "system" };

async function findTerminal(payload: Payload): Promise<VerificationRequest[]> {
	const found = await payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		where: { status: { in: [...TERMINAL_STATUSES] } },
	});
	return found.docs;
}

async function purgeDueDocuments(
	payload: Payload,
	now: Date,
): Promise<string[]> {
	const terminal = await findTerminal(payload);
	const dueIds = terminal
		.filter((request) => {
			const due = documentPurgeDueAt(request, now);
			return due !== null && due.getTime() <= now.getTime();
		})
		.map((request) => String(request.id));
	if (dueIds.length === 0) return [];
	return purgeDocumentFiles(payload, { request: { in: dueIds } }, now);
}

async function stripDueRows(payload: Payload, now: Date): Promise<string[]> {
	const terminal = await findTerminal(payload);
	const stripped: string[] = [];
	for (const request of terminal) {
		const due = rowStripDueAt(request);
		if (!due || due.getTime() > now.getTime()) continue;

		await withTransaction(payload, async (req) => {
			await req.payload.update({
				collection: "verification-requests",
				id: request.id,
				req,
				overrideAccess: true,
				context: VERIFICATION_CONTEXT,
				data: {
					kyc: request.kyc
						? {
								...request.kyc,
								givenNames: null,
								familyName: null,
								documentNumberHash: null,
							}
						: request.kyc,
					business: null,
					decision: request.decision
						? { ...request.decision, sellerMessage: null, internalNote: null }
						: request.decision,
				} as never,
			});
		});
		stripped.push(String(request.id));
	}
	return stripped;
}

/**
 * Each vendor deletion is attempted independently, outside any database
 * transaction — it is a network call to a third party, not a write this
 * process controls the durability of. A failure is never marked done: the
 * row stays due, so tomorrow's run (and every night after that) tries again
 * until the vendor confirms. A "best effort, once" deletion is not a
 * deletion commitment.
 */
async function purgeVendorSessions(
	payload: Payload,
	now: Date,
): Promise<{ deleted: string[]; retried: string[] }> {
	const found = await payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		where: {
			and: [
				{ "kyc.sessionRef": { exists: true } },
				{ "kyc.vendorDataDeletedAt": { exists: false } },
			],
		},
	});

	const deleted: string[] = [];
	const retried: string[] = [];
	for (const request of found.docs) {
		const due = vendorDeletionDueAt(request);
		if (!due || due.getTime() > now.getTime()) continue;
		const provider = request.kyc?.provider;
		const sessionRef = request.kyc?.sessionRef;
		if (!provider || !sessionRef) continue;

		try {
			await getKycProvider(provider).deleteSessionData(sessionRef);
			await payload.update({
				collection: "verification-requests",
				id: request.id,
				overrideAccess: true,
				context: VERIFICATION_CONTEXT,
				data: {
					kyc: { ...request.kyc, vendorDataDeletedAt: now.toISOString() },
				} as never,
			});
			deleted.push(String(request.id));
		} catch (error) {
			payload.logger.warn(
				{ err: error, requestId: request.id },
				"[verification] vendor deletion failed; will retry",
			);
			retried.push(String(request.id));
		}
	}
	return { deleted, retried };
}

async function purgeOldViews(payload: Payload, now: Date): Promise<number> {
	const cutoff = new Date(
		now.getTime() - RETENTION.documentViewYears * 365 * DAY_MS,
	).toISOString();
	const found = await payload.find({
		collection: "verification-document-views",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		where: { createdAt: { less_than_equal: cutoff } },
	});
	for (const view of found.docs) {
		await payload.delete({
			collection: "verification-document-views",
			id: view.id,
			overrideAccess: true,
		});
	}
	return found.docs.length;
}

async function expireLapsedApprovals(
	payload: Payload,
	now: Date,
): Promise<void> {
	const found = await payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		where: {
			and: [
				{ status: { equals: "approved" } },
				{ expiresAt: { less_than_equal: now.toISOString() } },
			],
		},
	});
	for (const request of found.docs) {
		await expireRequest(payload, String(request.id), "lapsed");
	}
}

async function expireIdleOpenRequests(
	payload: Payload,
	now: Date,
): Promise<void> {
	const draftCutoff = new Date(
		now.getTime() - RETENTION.draftIdleDays * DAY_MS,
	).toISOString();
	const drafts = await payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		where: {
			and: [
				{ status: { equals: "draft" } },
				{ updatedAt: { less_than_equal: draftCutoff } },
			],
		},
	});
	for (const request of drafts.docs) {
		await expireRequest(payload, String(request.id), "idle");
	}

	const needsInfoCutoff = new Date(
		now.getTime() - RETENTION.needsInfoIdleDays * DAY_MS,
	).toISOString();
	const needsInfo = await payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		where: {
			and: [
				{ status: { equals: "needs_info" } },
				{ updatedAt: { less_than_equal: needsInfoCutoff } },
			],
		},
	});
	for (const request of needsInfo.docs) {
		await expireRequest(payload, String(request.id), "no_response");
	}
}

async function releaseStaleClaims(payload: Payload, now: Date): Promise<void> {
	const cutoff = new Date(
		now.getTime() - RETENTION.staleClaimHours * 3_600_000,
	).toISOString();
	const found = await payload.find({
		collection: "verification-requests",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		where: {
			and: [
				{ status: { equals: "in_review" } },
				{ claimedAt: { less_than_equal: cutoff } },
			],
		},
	});
	for (const request of found.docs) {
		await releaseRequest(payload, SYSTEM_ACTOR, String(request.id), {
			system: true,
		});
	}
}

/**
 * Fires the 30- and 7-day expiry notice once each. The marker lives on the
 * shop, not on the backing request: a shop's `levelExpiresAt` is what a
 * seller is actually told is running out, and it is the one field
 * guaranteed to exist for any shop worth notifying, whatever became of the
 * request that put it there. Written through `writeShop`, the single writer
 * of shop fields.
 */
async function notifyExpiringShops(
	payload: Payload,
	now: Date,
): Promise<string[]> {
	return withTransaction(payload, async (req) => {
		const found = await req.payload.find({
			collection: "shops",
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
			req,
			where: { levelExpiresAt: { exists: true } },
		});

		const notified: string[] = [];
		for (const shop of found.docs) {
			if (!shop.levelExpiresAt) continue;
			const daysUntil = Math.round(
				(Date.parse(String(shop.levelExpiresAt)) - now.getTime()) / DAY_MS,
			);
			const threshold = (RETENTION.expiryNoticeDays as readonly number[]).find(
				(d) => d === daysUntil,
			);
			if (threshold === undefined) continue;
			if (shop.notifiedExpiryDays === threshold) continue;

			await writeShop(req, String(shop.id), {
				notifiedExpiryDays: threshold,
			});
			await notifyVerificationExpiring(req, {
				subscriberId: relationId(shop.owner) ?? "",
				shopName: shop.name,
				daysUntil: threshold,
			});
			notified.push(String(shop.id));
		}
		return notified;
	});
}

/**
 * Runs every retention rule, each independently so one failing does not
 * abandon the rest. Nightly, and it ignores `verification.enabled` entirely:
 * a shop's data does not stop ageing because the feature is paused.
 */
export async function purgeVerificationData(
	payload: Payload,
	now: Date = new Date(),
): Promise<PurgeReport> {
	const filesPurged = await purgeDueDocuments(payload, now);
	const rowsStripped = await stripDueRows(payload, now);
	const { deleted: vendorDeleted, retried: vendorRetried } =
		await purgeVendorSessions(payload, now);
	const viewsDeleted = await purgeOldViews(payload, now);
	await expireLapsedApprovals(payload, now);
	await expireIdleOpenRequests(payload, now);
	await releaseStaleClaims(payload, now);
	const expiringNotified = await notifyExpiringShops(payload, now);

	return {
		filesPurged,
		rowsStripped,
		vendorDeleted,
		vendorRetried,
		viewsDeleted,
		expiringNotified,
	};
}

export const purgeVerificationDataTask: TaskConfig<"purgeVerificationData"> = {
	slug: "purgeVerificationData",
	retries: 1,
	inputSchema: [],
	schedule: [{ cron: "0 3 * * *", queue: "nightly" }],
	handler: async ({ req }) => {
		const report = await purgeVerificationData(req.payload);
		return {
			output: {
				filesPurged: report.filesPurged.length,
				rowsStripped: report.rowsStripped.length,
				vendorDeleted: report.vendorDeleted.length,
				vendorRetried: report.vendorRetried.length,
				viewsDeleted: report.viewsDeleted,
				expiringNotified: report.expiringNotified.length,
			},
		};
	},
};
