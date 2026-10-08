import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import type { Payload, File as PayloadFile, PayloadRequest } from "payload";
import sharp from "sharp";
import { requireOrderAudience } from "../access/orderAccess";
import { isModerator } from "../access/roles";
import {
	DISPUTE_EVIDENCE_KINDS,
	DISPUTE_EVIDENCE_MIME_TYPES,
} from "../collections/DisputeEvidence";
import { getDisputeSettings } from "../lib/caseSettings";
import { ERROR_CODES } from "../lib/errors";
import { exifDateOriginal } from "../lib/exifDate";
import { sha256 } from "../lib/hash";
import { createSignedDocumentUrl } from "../lib/privateFiles";
import { getCounterStore, hitRateLimit } from "../lib/rateLimit";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { withTransaction } from "../lib/transactions";
import type { DisputeEvidence } from "../payload-types";
import { recordRiskSignal } from "./riskSignals";
import type { ServiceUser } from "./shops";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const UPLOADS_PER_HOUR = 20;

type EvidenceKind = (typeof DISPUTE_EVIDENCE_KINDS)[number];
type EvidenceMimeType = (typeof DISPUTE_EVIDENCE_MIME_TYPES)[number];

export interface UploadEvidenceInput {
	disputeId?: string;
	returnCaseId?: string;
	user: ServiceUser;
	file: PayloadFile;
	kind: EvidenceKind;
}

interface EvidenceParent {
	id: string;
	orderId: string;
	shopId: string | null;
	buyerId: string;
	collection: "disputes" | "return-cases";
}

function serviceError(
	code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
	status: number,
) {
	return new ServiceError(code, status);
}

function fileConstraints(mimeType: string): {
	maxBytes: number;
	output: string | null;
} {
	if (mimeType.startsWith("image/")) {
		if (
			!(DISPUTE_EVIDENCE_MIME_TYPES as readonly string[]).includes(mimeType)
		) {
			throw serviceError(ERROR_CODES.uploadInvalidType, 400);
		}
		return {
			maxBytes: MAX_IMAGE_BYTES,
			output:
				mimeType === "image/png"
					? "png"
					: mimeType === "image/webp"
						? "webp"
						: "jpeg",
		};
	}
	if (mimeType === "video/mp4" || mimeType === "video/quicktime") {
		return { maxBytes: MAX_VIDEO_BYTES, output: null };
	}
	if (mimeType === "application/pdf") {
		return { maxBytes: MAX_DOCUMENT_BYTES, output: null };
	}
	throw serviceError(ERROR_CODES.uploadInvalidType, 400);
}

async function loadParent(
	payload: Payload,
	input: Pick<UploadEvidenceInput, "disputeId" | "returnCaseId">,
	req?: PayloadRequest,
): Promise<EvidenceParent> {
	if (Boolean(input.disputeId) === Boolean(input.returnCaseId)) {
		throw serviceError(ERROR_CODES.badRequest, 400);
	}
	if (input.disputeId) {
		const dispute = await payload
			.findByID({
				collection: "disputes",
				id: input.disputeId,
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null);
		if (!dispute) throw serviceError(ERROR_CODES.notFound, 404);
		const orderId = relationId(dispute.order);
		if (!orderId) throw serviceError(ERROR_CODES.notFound, 404);
		const { order } = await requireOrderAudience(
			payload,
			req?.user ?? undefined,
			orderId,
			req,
		);
		return {
			id: String(dispute.id),
			orderId,
			shopId: relationId(dispute.shop) ?? relationId(order.shop),
			buyerId: relationId(dispute.buyer) ?? relationId(order.buyer) ?? "",
			collection: "disputes",
		};
	}
	const kase = await payload
		.findByID({
			collection: "return-cases",
			id: input.returnCaseId ?? "",
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	if (!kase) throw serviceError(ERROR_CODES.notFound, 404);
	const orderId = relationId(kase.order);
	if (!orderId) throw serviceError(ERROR_CODES.notFound, 404);
	await requireOrderAudience(payload, req?.user ?? undefined, orderId, req);
	return {
		id: String(kase.id),
		orderId,
		shopId: relationId(kase.shop),
		buyerId: relationId(kase.buyer) ?? "",
		collection: "return-cases",
	};
}

function uploaderType(
	user: ServiceUser,
	parent: EvidenceParent,
): NonNullable<DisputeEvidence["uploadedByType"]> {
	if (isModerator(user)) return "moderator";
	return user.id === parent.buyerId ? "buyer" : "seller";
}

function fileNameFor(mimeType: string, output: string | null): string {
	const extension =
		output === "jpeg"
			? ".jpg"
			: output === "png"
				? ".png"
				: output === "webp"
					? ".webp"
					: mimeType === "video/quicktime"
						? ".mov"
						: mimeType === "video/mp4"
							? ".mp4"
							: ".pdf";
	return `${randomUUID()}${extension}`;
}

export async function uploadEvidence(
	payload: Payload,
	input: UploadEvidenceInput,
): Promise<DisputeEvidence> {
	const constraints = fileConstraints(input.file.mimetype);
	if (input.file.size > constraints.maxBytes) {
		throw serviceError(ERROR_CODES.uploadTooLarge, 413);
	}
	if (!(DISPUTE_EVIDENCE_KINDS as readonly string[]).includes(input.kind)) {
		throw serviceError(ERROR_CODES.badRequest, 400);
	}
	if (
		await hitRateLimit(getCounterStore(), `case-evidence:${input.user.id}`, [
			{
				name: "case-evidence-upload",
				limit: UPLOADS_PER_HOUR,
				windowSeconds: 3600,
			},
		])
	) {
		throw serviceError(ERROR_CODES.rateLimited, 429);
	}

	const original = input.file.data;
	const hash = sha256(original);
	let storedBytes = original;
	let storedMime = input.file.mimetype as EvidenceMimeType;
	let capturedAt: string | null = null;
	if (constraints.output) {
		const image = sharp(original, { limitInputPixels: 100_000_000 });
		const metadata = await image.metadata();
		capturedAt = metadata.exif ? exifDateOriginal(metadata.exif) : null;
		const output = image.rotate();
		const buffer =
			constraints.output === "png"
				? await output.png().toBuffer()
				: constraints.output === "webp"
					? await output.webp().toBuffer()
					: await output.jpeg({ quality: 90 }).toBuffer();
		storedBytes = buffer;
		storedMime =
			`image/${constraints.output === "jpeg" ? "jpeg" : constraints.output}` as EvidenceMimeType;
	}

	return withTransaction(
		payload,
		async (req) => {
			const parent = await loadParent(payload, input, req);
			const actorType = uploaderType(input.user, parent);
			const settings = await getDisputeSettings(payload);
			const linkField =
				parent.collection === "disputes" ? "dispute" : "returnCase";
			const caseFilter = { [linkField]: { equals: parent.id } };
			const [partyCount, totalCount, recentCount, duplicates] =
				await Promise.all([
					payload.count({
						collection: "dispute-evidence",
						where: {
							and: [caseFilter, { uploadedByType: { equals: actorType } }],
						},
						overrideAccess: true,
						req,
					}),
					payload.count({
						collection: "dispute-evidence",
						where: {
							and: [caseFilter, { uploadedByType: { not_equals: "system" } }],
						},
						overrideAccess: true,
						req,
					}),
					payload.count({
						collection: "dispute-evidence",
						where: {
							and: [
								{ uploadedBy: { equals: input.user.id } },
								{
									createdAt: {
										greater_than_equal: new Date(
											Date.now() - 3_600_000,
										).toISOString(),
									},
								},
							],
						},
						overrideAccess: true,
						req,
					}),
					payload.find({
						collection: "dispute-evidence",
						where: { sha256: { equals: hash } },
						limit: 0,
						pagination: false,
						depth: 0,
						overrideAccess: true,
						req,
					}),
				]);
			if (
				partyCount.totalDocs >= settings.evidenceLimit.perParty ||
				totalCount.totalDocs >= settings.evidenceLimit.total
			) {
				throw serviceError(ERROR_CODES.disputeEvidenceLimit, 409);
			}
			if (recentCount.totalDocs >= UPLOADS_PER_HOUR) {
				throw serviceError(ERROR_CODES.rateLimited, 429);
			}
			const priorAccount = duplicates.docs.find(
				(doc) => relationId(doc.uploadedBy) !== input.user.id,
			);
			const created = await payload.create({
				collection: "dispute-evidence",
				req,
				overrideAccess: true,
				file: {
					data: storedBytes,
					name: fileNameFor(storedMime, constraints.output),
					mimetype: storedMime,
					size: storedBytes.byteLength,
				},
				data: {
					[linkField]: parent.id,
					uploadedByType: actorType,
					uploadedBy: input.user.id,
					kind: input.kind,
					mimeType: storedMime,
					size: storedBytes.byteLength,
					sha256: hash,
					capturedAt,
					exifStripped: constraints.output !== null,
					visibility: "parties",
				},
			});
			if (priorAccount) {
				await recordRiskSignal(req, {
					subjectType: parent.shopId ? "shop" : "user",
					subjectId: parent.shopId ?? input.user.id,
					signal: "evidence_reused",
					sourceType:
						parent.collection === "disputes" ? "dispute" : "return-case",
					sourceId: parent.id,
				});
			}
			return created;
		},
		{ user: input.user },
	);
}

async function loadEvidenceAudience(
	payload: Payload,
	user: ServiceUser,
	evidence: DisputeEvidence,
	req?: PayloadRequest,
): Promise<EvidenceParent> {
	const disputeId = relationId(evidence.dispute);
	const returnCaseId = relationId(evidence.returnCase);
	const parent = await loadParent(
		payload,
		{
			disputeId: disputeId ?? undefined,
			returnCaseId: returnCaseId ?? undefined,
		},
		req,
	);
	if (evidence.visibility === "staff" && !isModerator(user)) {
		throw serviceError(ERROR_CODES.notFound, 404);
	}
	await requireOrderAudience(payload, user, parent.orderId, req);
	return parent;
}

export async function evidenceUrl(
	payload: Payload,
	user: ServiceUser,
	evidenceId: string,
	requestMeta: { ipHash?: string; userAgent?: string } = {},
	expectedParentId?: string,
): Promise<{ url: string; expiresAt: string; mimeType: string }> {
	return withTransaction(
		payload,
		async (req) => {
			const evidence = await req.payload
				.findByID({
					collection: "dispute-evidence",
					id: evidenceId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null);
			if (!evidence?.filename) throw serviceError(ERROR_CODES.notFound, 404);
			const parent = await loadEvidenceAudience(payload, user, evidence, req);
			if (expectedParentId && parent.id !== expectedParentId) {
				throw serviceError(ERROR_CODES.notFound, 404);
			}
			await req.payload.create({
				collection: "dispute-evidence-views",
				req,
				overrideAccess: true,
				data: {
					evidence: evidence.id,
					...(parent.collection === "disputes"
						? { dispute: parent.id }
						: { returnCase: parent.id }),
					viewer: user.id,
					viewerRole: isModerator(user)
						? "moderator"
						: user.id === parent.buyerId
							? "buyer"
							: "seller",
					ipHash: requestMeta.ipHash ?? null,
					userAgent: requestMeta.userAgent?.slice(0, 200) ?? null,
				},
			});
			const signed = await createSignedDocumentUrl(
				{
					id: String(evidence.id),
					filename: evidence.filename,
					mimeType: evidence.mimeType,
					prefix: "dispute-evidence",
				},
				300,
				"/api/dispute-evidence/files",
			);
			return {
				url: signed.url,
				expiresAt: signed.expiresAt.toISOString(),
				mimeType: evidence.mimeType ?? "application/octet-stream",
			};
		},
		{ user },
	);
}

export async function setEvidenceVisibility(
	payload: Payload,
	moderator: ServiceUser,
	evidenceId: string,
	visibility: "parties" | "staff",
): Promise<DisputeEvidence> {
	if (!isModerator(moderator)) throw serviceError(ERROR_CODES.forbidden, 403);
	return payload.update({
		collection: "dispute-evidence",
		id: evidenceId,
		overrideAccess: true,
		data: { visibility },
	});
}

export async function purgeCaseEvidence(
	payload: Payload,
	now = new Date(),
): Promise<string[]> {
	const due = await payload.find({
		collection: "dispute-evidence",
		where: {
			and: [
				{ purgeAfter: { less_than_equal: now.toISOString() } },
				{ filename: { exists: true } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const collection = payload.collections["dispute-evidence"];
	const staticDir = collection.config.upload.staticDir;
	const purged: string[] = [];
	for (const evidence of due.docs) {
		const disputeId = relationId(evidence.dispute);
		if (disputeId) {
			const dispute = await payload
				.findByID({
					collection: "disputes",
					id: disputeId,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null);
			if (dispute?.legalHold) continue;
		}
		await withTransaction(payload, async (req) => {
			if (evidence.filename) {
				const hooks = collection.config.hooks.afterDelete;
				if (hooks.length) {
					for (const hook of hooks) {
						await hook({
							collection: collection.config,
							context: req.context ?? {},
							doc: evidence,
							id: String(evidence.id),
							req,
						});
					}
				} else if (staticDir) {
					await unlink(
						path.join(staticDir, path.basename(evidence.filename)),
					).catch((error: unknown) => {
						if (
							typeof error === "object" &&
							error !== null &&
							"code" in error &&
							error.code !== "ENOENT"
						) {
							throw error;
						}
					});
				}
			}
			await req.payload.update({
				collection: "dispute-evidence",
				id: evidence.id,
				overrideAccess: true,
				req,
				data: { filename: null, mimeType: null, filesize: null, size: null },
			});
		});
		purged.push(String(evidence.id));
	}
	return purged;
}
