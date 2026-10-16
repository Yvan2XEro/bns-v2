// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	acceptPickedEvidence,
	DISPUTE_OPEN_EVIDENCE_MAX,
} from "../../../mobile/src/lib/disputeOpenForm";
import { DISPUTE_EVIDENCE_MIME_TYPES as COLLECTION_MIME_TYPES } from "../../src/collections/DisputeEvidence";
import {
	DISPUTE_EVIDENCE_MAX_BYTES,
	DISPUTE_EVIDENCE_MIME_TYPES,
	disputeEvidenceFileIssue,
} from "../../src/contracts/disputes";
import { ERROR_CODES } from "../../src/lib/errors";
import { ServiceError } from "../../src/lib/serviceError";
import { uploadEvidence } from "../../src/services/disputeEvidence";
import { fakePayload } from "./helpers/fakePayload";

/**
 * The one-page report checks each picked file with `disputeEvidenceFileIssue`
 * before the case is opened. A file it lets through must not be refused by the
 * upload for its type or size, and one it refuses must be refused the same way.
 */
const CASES: Array<{ mime: string; size: number }> = [
	{ mime: "image/jpeg", size: DISPUTE_EVIDENCE_MAX_BYTES.image + 1 },
	{ mime: "image/heic", size: DISPUTE_EVIDENCE_MAX_BYTES.image + 1 },
	{ mime: "video/mp4", size: DISPUTE_EVIDENCE_MAX_BYTES.video + 1 },
	{ mime: "video/quicktime", size: DISPUTE_EVIDENCE_MAX_BYTES.video + 1 },
	{ mime: "application/pdf", size: DISPUTE_EVIDENCE_MAX_BYTES.document + 1 },
	{ mime: "image/gif", size: 10 },
	{ mime: "video/webm", size: 10 },
	{ mime: "text/plain", size: 10 },
];

async function refusalOf(mime: string, size: number): Promise<string | null> {
	try {
		await uploadEvidence(fakePayload({}), {
			disputeId: "d-1",
			user: { id: "buyer-1" },
			kind: "photo",
			file: { data: Buffer.alloc(0), name: "f", mimetype: mime, size },
		});
		return null;
	} catch (error) {
		return error instanceof ServiceError ? error.code : "other";
	}
}

describe("dispute evidence: the form refuses exactly what the upload refuses", () => {
	it.each(CASES)("$mime at $size bytes", async ({ mime, size }) => {
		const issue = disputeEvidenceFileIssue(mime, size);
		const refusal = await refusalOf(mime, size);
		expect(issue).not.toBeNull();
		expect(refusal).toBe(
			issue === "type"
				? ERROR_CODES.uploadInvalidType
				: ERROR_CODES.uploadTooLarge,
		);
	});

	it("accepts every type the upload accepts, at its size limit", () => {
		for (const mime of DISPUTE_EVIDENCE_MIME_TYPES) {
			const max = mime.startsWith("image/")
				? DISPUTE_EVIDENCE_MAX_BYTES.image
				: mime.startsWith("video/")
					? DISPUTE_EVIDENCE_MAX_BYTES.video
					: DISPUTE_EVIDENCE_MAX_BYTES.document;
			expect(disputeEvidenceFileIssue(mime, max)).toBeNull();
		}
	});

	it("the collection serves the contract's type list", () => {
		expect(COLLECTION_MIME_TYPES).toBe(DISPUTE_EVIDENCE_MIME_TYPES);
	});

	it("the mobile page runs the same check", () => {
		const { next, rejected } = acceptPickedEvidence(
			[],
			CASES.map(({ mime, size }) => ({
				uri: mime,
				mimeType: mime,
				fileSize: size,
			})),
			(_asset, index) => String(index),
		);
		expect(next).toHaveLength(0);
		expect(rejected).toHaveLength(CASES.length);
		expect(DISPUTE_OPEN_EVIDENCE_MAX).toBeGreaterThan(0);
	});
});
