import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type {
	Payload,
	PayloadRequest,
	File as UploadFile,
	Where,
} from "payload";
import {
	type DocumentKind,
	MAX_DOCUMENTS_PER_REQUEST,
} from "../collections/VerificationDocuments";
import type { BusinessType } from "../collections/VerificationRequests";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import { sha256 } from "../lib/hash";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { withTransaction } from "../lib/transactions";
import type {
	VerificationDocument,
	VerificationRequest,
} from "../payload-types";

export class VerificationDocumentError extends ServiceError {
	constructor(code: ErrorCode, status: number, message?: string) {
		super(code, status, message);
		this.name = "VerificationDocumentError";
	}
}

/** Every write below carries this so a collection hook could tell the origin, following moderation.ts. */
const VERIFICATION_DOCUMENT_CONTEXT = {
	verificationDocumentService: true,
} as const;

/** A request stays editable by its seller while it is a draft or answering a reviewer's request for more. */
const EDITABLE_STATUSES = ["draft", "needs_info"] as const;

export interface DocumentActor {
	id: string;
	role?: string | null;
	name?: string | null;
}

export const REQUIRED_DOCUMENTS = {
	entreprenant: ["entreprenant_declaration", "niu_certificate"],
	sole_trader: ["rccm_extract", "niu_certificate"],
	company: ["rccm_extract", "niu_certificate"],
	cooperative: ["rccm_extract", "niu_certificate"],
} as const satisfies Record<BusinessType, readonly DocumentKind[]>;

export function requiredDocumentKinds(business: {
	businessType: BusinessType | null | undefined;
	legalRepresentativeIsOwner?: boolean | null;
}): DocumentKind[] {
	if (!business.businessType) return [];
	const base: DocumentKind[] = [...REQUIRED_DOCUMENTS[business.businessType]];
	if (business.legalRepresentativeIsOwner === false) {
		base.push("legal_representative_id", "mandate");
	}
	return base;
}

export function missingDocumentKinds(
	business: Parameters<typeof requiredDocumentKinds>[0],
	documents: { kind: DocumentKind | string }[],
): DocumentKind[] {
	const present = new Set(documents.map((d) => d.kind));
	return requiredDocumentKinds(business).filter((kind) => !present.has(kind));
}

async function loadEditableRequest(
	payload: Payload,
	req: PayloadRequest,
	actor: DocumentActor,
	requestId: string,
): Promise<VerificationRequest> {
	let request: VerificationRequest;
	try {
		request = await payload.findByID({
			collection: "verification-requests",
			id: requestId,
			depth: 0,
			overrideAccess: true,
			req,
		});
	} catch {
		throw new VerificationDocumentError(ERROR_CODES.notFound, 404);
	}
	if (relationId(request.submittedBy) !== actor.id) {
		throw new VerificationDocumentError(ERROR_CODES.verificationNotOwner, 403);
	}
	if (!(EDITABLE_STATUSES as readonly string[]).includes(request.status)) {
		throw new VerificationDocumentError(
			ERROR_CODES.verificationInvalidTransition,
			409,
		);
	}
	return request;
}

/**
 * The `documents` join field on `VerificationRequests` cannot be exercised here:
 * `tests/int/helpers/fakePayload.ts` has no join support at all (no `type: "join"`
 * handling in `find`/`findByID`), so nothing in this file reads it — every "which
 * documents does this request have" question below is a direct `verification-documents`
 * query instead, which the fake and a real deployment answer the same way.
 */
export async function addDocument(
	payload: Payload,
	actor: DocumentActor,
	requestId: string,
	file: UploadFile,
	kind: DocumentKind,
): Promise<VerificationDocument> {
	return withTransaction(
		payload,
		async (req) => {
			const request = await loadEditableRequest(payload, req, actor, requestId);
			const shopId = relationId(request.shop);
			if (!shopId)
				throw new VerificationDocumentError(ERROR_CODES.notFound, 404);

			const existing = await payload.count({
				collection: "verification-documents",
				where: { request: { equals: requestId } },
				overrideAccess: true,
				req,
			});
			if (existing.totalDocs >= MAX_DOCUMENTS_PER_REQUEST) {
				throw new VerificationDocumentError(
					ERROR_CODES.verificationDocumentLimit,
					409,
				);
			}

			const hash = sha256(file.data);
			// Same bytes on the seller's own shop is a re-upload, not a signal; the
			// same bytes on someone else's shop is the fraud pattern this exists to catch.
			const crossShopMatches = await payload.find({
				collection: "verification-documents",
				where: {
					and: [{ sha256: { equals: hash } }, { shop: { not_equals: shopId } }],
				},
				overrideAccess: true,
				pagination: false,
				depth: 0,
				req,
			});
			const duplicateOf = crossShopMatches.docs.map((doc) => String(doc.id));

			return payload.create({
				collection: "verification-documents",
				overrideAccess: true,
				context: VERIFICATION_DOCUMENT_CONTEXT,
				req,
				file: {
					data: file.data,
					name: `${randomUUID()}${extname(file.name)}`,
					mimetype: file.mimetype,
					size: file.size,
				},
				data: {
					request: requestId,
					shop: shopId,
					kind,
					sha256: hash,
					originalFilename: file.name,
					uploadedBy: actor.id,
					duplicateOf,
				},
			});
		},
		{ user: actor },
	);
}

export async function removeDocument(
	payload: Payload,
	actor: DocumentActor,
	requestId: string,
	documentId: string,
): Promise<void> {
	await withTransaction(
		payload,
		async (req) => {
			await loadEditableRequest(payload, req, actor, requestId);

			let document: VerificationDocument;
			try {
				document = await payload.findByID({
					collection: "verification-documents",
					id: documentId,
					depth: 0,
					overrideAccess: true,
					req,
				});
			} catch {
				throw new VerificationDocumentError(ERROR_CODES.notFound, 404);
			}
			if (relationId(document.request) !== requestId) {
				throw new VerificationDocumentError(ERROR_CODES.notFound, 404);
			}

			await payload.delete({
				collection: "verification-documents",
				id: documentId,
				overrideAccess: true,
				context: VERIFICATION_DOCUMENT_CONTEXT,
				req,
			});
		},
		{ user: actor },
	);
}

// ─── Purge ───────────────────────────────────────────────────────────────────
//
// `generate:types` was not re-run for the `upload` config `VerificationDocuments`
// gained in Task 3: the `VerificationDocument` interface in `payload-types.ts`
// has none of `filename`/`mimeType`/`filesize`, unlike every other upload
// collection (compare `Media`). Re-running it here would fold in whatever the
// other agents working this tree concurrently have mid-flight, so the code
// below never claims those fields are typed — it reads them off the raw
// document through a guard, the same way `stock.ts` reads `payload.db.updateOne`'s
// untyped result.

interface PurgeCandidate {
	id: string;
	filename: string | null;
}

function asPurgeCandidate(value: unknown): PurgeCandidate | null {
	if (typeof value !== "object" || value === null) return null;
	if (!("id" in value)) return null;
	const { id } = value;
	if (typeof id !== "string") return null;
	const filename = "filename" in value ? value.filename : null;
	return { id, filename: typeof filename === "string" ? filename : null };
}

function errorCode(error: unknown): string | null {
	if (typeof error !== "object" || error === null) return null;
	if (!("code" in error)) return null;
	const { code } = error;
	return typeof code === "string" ? code : null;
}

async function deleteLocalFile(
	staticDir: string,
	filename: string,
): Promise<void> {
	try {
		await unlink(join(staticDir, basename(filename)));
	} catch (error) {
		if (errorCode(error) === "ENOENT") return;
		throw error;
	}
}

/**
 * Drops the stored bytes of every document matched by `where` that is not
 * already purged, keeping its row (kind, hash, uploader) for the audit trail.
 * Task 16 exercises this end to end against a real storage backend; this
 * sandbox has neither Mongo nor S3/Azure to prove it against.
 *
 * Local storage deletes the file directly under the collection's `staticDir`.
 * S3/Azure register their delete through `@payloadcms/plugin-cloud-storage`,
 * which wires itself in as the collection's own `afterDelete` hook (see
 * `getAfterDeleteHook` in that package) — calling it here, outside an actual
 * delete, is the only way to drop the object without deleting the row.
 */
export async function purgeDocumentFiles(
	payload: Payload,
	where: Where,
	now: Date,
	ambientReq?: PayloadRequest,
): Promise<string[]> {
	const run = async (req: PayloadRequest) => {
		const matched = await payload.find({
			collection: "verification-documents",
			where: { and: [where, { purgedAt: { exists: false } }] },
			overrideAccess: true,
			pagination: false,
			depth: 0,
			req,
		});

		const collection = payload.collections["verification-documents"];
		const afterDeleteHooks = collection.config.hooks.afterDelete;
		const staticDir = collection.config.upload.staticDir;
		const purgedIds: string[] = [];

		for (const doc of matched.docs) {
			const candidate = asPurgeCandidate(doc);
			if (!candidate) continue;

			if (candidate.filename) {
				if (afterDeleteHooks.length > 0) {
					for (const hook of afterDeleteHooks) {
						await hook({
							collection: collection.config,
							context: req.context ?? {},
							doc,
							id: candidate.id,
							req,
						});
					}
				} else if (staticDir) {
					await deleteLocalFile(staticDir, candidate.filename);
				}
			}

			await payload.db.updateOne({
				collection: "verification-documents",
				id: candidate.id,
				data: {
					purgedAt: now.toISOString(),
					filename: null,
					mimeType: null,
					filesize: null,
				},
				req,
			});
			purgedIds.push(candidate.id);
		}

		return purgedIds;
	};

	// Account deletion runs this as one step of its own cascade and must not
	// let it commit independently of the rest; the nightly purge job has no
	// ambient transaction to join, so it opens its own.
	return ambientReq ? run(ambientReq) : withTransaction(payload, run);
}
