import { describe, expect, it } from "bun:test";
import { disputeActionGroups } from "./dispute-flow";

describe("disputeActionGroups", () => {
	it("groups only server-authorized actions without deriving from status", () => {
		expect(
			disputeActionGroups([
				"message",
				"respond_accept",
				"proposal_reject",
				"upload_evidence",
			]),
		).toEqual({
			conversation: ["message", "upload_evidence"],
			response: ["respond_accept", "proposal_reject"],
		});
	});

	it("does not expose unknown server actions as client controls", () => {
		expect(disputeActionGroups(["future_action", "withdraw"])).toEqual({
			conversation: [],
			response: ["withdraw"],
		});
	});
});
