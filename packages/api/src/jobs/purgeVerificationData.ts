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

/**
 * Every subfield nulled explicitly, rather than the group itself. Payload's
 * own field pipeline normalises a *missing* group with
 * `if (typeof siblingData[field.name] !== 'object') siblingData[field.name] = {}`
 * (`beforeValidate`/`beforeChange` promise.js) — and `typeof null === "object"`
 * passes that guard, so a bare `business: null` slips through as `null` and
 * `traverseFields` then dereferences it across every one of these subfields.
 * This object is a value, never `null`, so it can never hit that path.
 */
export const NULLED_BUSINESS: NonNullable<VerificationRequest["business"]> = {
	businessType: null,
	legalName: null,
	tradeName: null,
	rccmNumber: null,
	entreprenantDeclarationNumber: null,
	niu: null,
	registeredAddress: null,
	city: null,
	legalRepresentativeName: null,
	legalRepresentativeIsOwner: null,
};

/**
 * Runs one retention step in isolation: a failure is logged and swallowed so
 * the rest of the nightly chain still runs. Without this, the eight steps
 * below shared a single failure domain — one throw (C5's `business: null`
 * dereference, for instance) silently cancelled every rule after it, every
 * night, forever.
 */
async function runStep<T>(
	payload: Payload,
	step: string,
	fallback: T,
	fn: () => Promise<T>,
): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		payload.logger.error(
			{ err: error, step },
			"[verification] retention step failed; continuing with the rest",
		);
		return fallback;
	}
}

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
								// Unfiltered vendor free text, not a machine code — the
								// same evidence-minimisation rule as the names above.
								vendorWarnings: null,
							}
						: request.kyc,
					business: request.business ? NULLED_BUSINESS : request.business,
					decision: request.decision
						? { ...request.decision, sellerMessage: null, internalNote: null }
						: request.decision,
				},
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
 *
 * A threshold fires on `daysUntil <= threshold`, not `===`: a run skipped on
 * the exact day — a deploy, an outage, this very job aborting before its
 * last step — must still send the notice the next time the job runs, not
 * skip it forever. Among the thresholds this shop has reached, only the most
 * urgent (smallest) one that is still more urgent than whatever was last
 * sent fires, so a run that catches up after a long gap sends one notice,
 * not a backlog of both. `setShopLevel` (`services/shops.ts`) clears
 * `notifiedExpiryDays` whenever a recompute changes `levelExpiresAt`, so a
 * renewal inside the old window gets its own 30- and 7-day notices instead
 * of inheriting the previous cycle's marker.
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
			const already = shop.notifiedExpiryDays ?? Number.POSITIVE_INFINITY;
			const threshold = (RETENTION.expiryNoticeDays as readonly number[])
				.filter((d) => daysUntil <= d && d < already)
				.sort((a, b) => a - b)[0];
			if (threshold === undefined) continue;

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
 * abandon the rest — each step runs through `runStep`, which logs and
 * swallows its own failure rather than letting it propagate to the next
 * `await`. Nightly, and it ignores `verification.enabled` entirely: a shop's
 * data does not stop ageing because the feature is paused.
 */
export async function purgeVerificationData(
	payload: Payload,
	now: Date = new Date(),
): Promise<PurgeReport> {
	const filesPurged = await runStep(payload, "purgeDueDocuments", [], () =>
		purgeDueDocuments(payload, now),
	);
	const rowsStripped = await runStep(payload, "stripDueRows", [], () =>
		stripDueRows(payload, now),
	);
	const { deleted: vendorDeleted, retried: vendorRetried } = await runStep(
		payload,
		"purgeVendorSessions",
		{ deleted: [], retried: [] },
		() => purgeVendorSessions(payload, now),
	);
	const viewsDeleted = await runStep(payload, "purgeOldViews", 0, () =>
		purgeOldViews(payload, now),
	);
	await runStep(payload, "expireLapsedApprovals", undefined, () =>
		expireLapsedApprovals(payload, now),
	);
	await runStep(payload, "expireIdleOpenRequests", undefined, () =>
		expireIdleOpenRequests(payload, now),
	);
	await runStep(payload, "releaseStaleClaims", undefined, () =>
		releaseStaleClaims(payload, now),
	);
	const expiringNotified = await runStep(
		payload,
		"notifyExpiringShops",
		[],
		() => notifyExpiringShops(payload, now),
	);

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
