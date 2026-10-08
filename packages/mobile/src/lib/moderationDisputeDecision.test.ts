import { describe, expect, it } from "bun:test";
import { canSubmitDisputeResolution } from "./moderationDisputeDecision";

describe("canSubmitDisputeResolution", () => {
	it("requires the server preview to match the refund being submitted", () => {
		expect(canSubmitDisputeResolution(null, 500)).toBe(false);
		expect(canSubmitDisputeResolution(400, 500)).toBe(false);
		expect(canSubmitDisputeResolution(500, 500)).toBe(true);
	});
});
