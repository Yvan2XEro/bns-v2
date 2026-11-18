import { describe, expect, test } from "bun:test";
import {
	DISPUTE_DESCRIPTION_MAX,
	DISPUTE_DESCRIPTION_MIN,
	DISPUTE_EVIDENCE_MAX_BYTES,
} from "../../../api/src/contracts/disputes";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import {
	acceptPickedEvidence,
	assetMimeType,
	DISPUTE_OPEN_EVIDENCE_MAX,
	evidenceKindFor,
	evidenceStillNeeded,
	failedUploads,
	nextSubmitStep,
	type PendingEvidence,
	uploadsToSend,
	withUploadStatus,
} from "./disputeOpenForm";

const key = (_: unknown, index: number) => `k${index}`;

function item(
	k: string,
	status: PendingEvidence["status"] = "queued",
): PendingEvidence {
	return {
		key: k,
		uri: `file:///${k}.jpg`,
		fileName: null,
		mimeType: "image/jpeg",
		size: 1000,
		status,
	};
}

describe("acceptPickedEvidence", () => {
	test("refuses what the upload route refuses", () => {
		const { next, rejected } = acceptPickedEvidence(
			[],
			[
				{ uri: "a", mimeType: "image/gif", fileSize: 10 },
				{
					uri: "b",
					mimeType: "image/jpeg",
					fileSize: DISPUTE_EVIDENCE_MAX_BYTES.image + 1,
				},
				{
					uri: "c",
					mimeType: "video/mp4",
					fileSize: DISPUTE_EVIDENCE_MAX_BYTES.video,
				},
			],
			key,
		);
		expect(rejected).toEqual(["type", "size"]);
		expect(next.map((entry) => entry.uri)).toEqual(["c"]);
	});

	test("stops at the page's cap", () => {
		const full = Array.from({ length: DISPUTE_OPEN_EVIDENCE_MAX }, (_, i) =>
			item(`x${i}`),
		);
		const { next, rejected } = acceptPickedEvidence(
			full,
			[{ uri: "z", mimeType: "image/png", fileSize: 10 }],
			key,
		);
		expect(next).toHaveLength(DISPUTE_OPEN_EVIDENCE_MAX);
		expect(rejected).toEqual(["limit"]);
	});

	test("guesses a type the picker left empty", () => {
		expect(assetMimeType({ uri: "v", type: "video" })).toBe("video/mp4");
		expect(assetMimeType({ uri: "i" })).toBe("image/jpeg");
		expect(assetMimeType({ uri: "i", mimeType: "IMAGE/PNG" })).toBe(
			"image/png",
		);
	});
});

describe("evidence rules", () => {
	test("the reason decides how many files are required", () => {
		expect(evidenceStillNeeded("not_received", 0)).toBe(0);
		expect(evidenceStillNeeded("damaged", 0)).toBe(1);
		expect(evidenceStillNeeded("counterfeit", 1)).toBe(1);
		expect(evidenceStillNeeded("counterfeit", 3)).toBe(0);
	});

	test("kinds follow the file type", () => {
		expect(evidenceKindFor("image/heic")).toBe("photo");
		expect(evidenceKindFor("video/quicktime")).toBe("video");
		expect(evidenceKindFor("application/pdf")).toBe("document");
	});

	test("description bounds are the route's", () => {
		expect(DISPUTE_DESCRIPTION_MIN).toBe(20);
		expect(DISPUTE_DESCRIPTION_MAX).toBe(2000);
	});
});

describe("submission steps", () => {
	test("opens the case first, then uploads, then submits", () => {
		expect(nextSubmitStep({ caseId: null, items: [item("a")] })).toBe("open");
		expect(nextSubmitStep({ caseId: "d1", items: [item("a")] })).toBe("upload");
		expect(nextSubmitStep({ caseId: "d1", items: [item("a", "done")] })).toBe(
			"submit",
		);
	});

	test("a retry sends only what failed or never went", () => {
		const items = [item("a", "done"), item("b", "failed"), item("c")];
		expect(uploadsToSend(items).map((entry) => entry.key)).toEqual(["b", "c"]);
		expect(failedUploads(items).map((entry) => entry.key)).toEqual(["b"]);
	});

	test("a status change keeps the error only on failure", () => {
		const failed = withUploadStatus(
			[item("a")],
			"a",
			"failed",
			"upload.tooLarge",
		);
		expect(failed[0]?.errorCode).toBe("upload.tooLarge");
		expect(withUploadStatus(failed, "a", "done")[0]?.errorCode).toBeUndefined();
	});

	test("every new string is in both locales", () => {
		for (const k of [
			"evidenceSection",
			"evidenceCount",
			"addEvidenceMedia",
			"evidenceRejected_type",
			"evidenceRejected_size",
			"evidenceRejected_limit",
			"uploadFailedTitle",
			"uploadFailedBody",
			"retryUploads",
			"openCase",
			"removeEvidence",
			"uploadingEvidence",
		]) {
			expect(typeof (fr.disputes as Record<string, unknown>)[k]).toBe("string");
			expect(typeof (en.disputes as Record<string, unknown>)[k]).toBe("string");
		}
	});
});
