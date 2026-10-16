import { describe, expect, test } from "bun:test";
import {
	disputeEvidenceStatus,
	evidenceKind,
	looseEvidence,
	MESSAGE_EVIDENCE_MAX,
	messageAttachments,
	signedEvidenceUrl,
	stageEvidence,
} from "./disputeEvidence";

describe("dispute evidence submission status", () => {
	test("requires two distinct files for a counterfeit claim", () => {
		expect(disputeEvidenceStatus("counterfeit", 1)).toEqual({
			required: 2,
			remaining: 1,
			canSubmit: false,
		});
	});

	test("allows submission once the reason's evidence threshold is met", () => {
		expect(disputeEvidenceStatus("damaged", 1)).toEqual({
			required: 1,
			remaining: 0,
			canSubmit: true,
		});
	});
});

describe("dispute evidence attachments", () => {
	const evidence = [
		{ id: "a", mimeType: "image/jpeg" },
		{ id: "b", mimeType: "video/mp4" },
		{ id: "c", mimeType: "application/pdf" },
	];

	test("maps a message's ids to kinds in order and skips unserved ids", () => {
		expect(messageAttachments(["c", "x", "a", "b"], evidence)).toEqual([
			{ id: "c", kind: "file", mimeType: "application/pdf" },
			{ id: "a", kind: "image", mimeType: "image/jpeg" },
			{ id: "b", kind: "video", mimeType: "video/mp4" },
		]);
	});

	test("evidenceKind falls back to file", () => {
		expect(evidenceKind("IMAGE/PNG")).toBe("image");
		expect(evidenceKind(null)).toBe("file");
	});

	test("loose evidence is what no message carries", () => {
		expect(
			looseEvidence(evidence, [{ evidenceIds: ["a"] }, { evidenceIds: [] }]),
		).toEqual([evidence[1], evidence[2]]);
	});

	test("stages at most five distinct ids", () => {
		let staged: string[] = [];
		for (const id of ["1", "2", "2", "3", "4", "5", "6"]) {
			staged = stageEvidence(staged, id);
		}
		expect(staged).toEqual(["1", "2", "3", "4", "5"]);
		expect(MESSAGE_EVIDENCE_MAX).toBe(5);
	});

	test("prefixes a local signed path, keeps a provider URL untouched", () => {
		expect(
			signedEvidenceUrl(
				"/api/dispute-evidence/files/1?exp=2&sig=3",
				"http://10.0.0.2:3000/",
			),
		).toBe("http://10.0.0.2:3000/api/dispute-evidence/files/1?exp=2&sig=3");
		const s3 = "https://bucket.s3.amazonaws.com/k?X-Amz-Signature=1";
		expect(signedEvidenceUrl(s3, "http://10.0.0.2:3000")).toBe(s3);
	});
});
