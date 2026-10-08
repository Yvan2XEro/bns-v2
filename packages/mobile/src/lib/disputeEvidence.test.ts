import { describe, expect, test } from "bun:test";
import { disputeEvidenceStatus } from "./disputeEvidence";

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
