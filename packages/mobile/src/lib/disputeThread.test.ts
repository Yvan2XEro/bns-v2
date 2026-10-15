import { describe, expect, test } from "bun:test";
import { disputeDeadline, disputeTone, messageAuthor } from "./disputeThread";

const deadlines = {
	submitBy: "2026-10-16T10:00:00.000Z",
	respondBy: "2026-10-18T10:00:00.000Z",
	reviewDueAt: "2026-10-22T10:00:00.000Z",
};

describe("disputeTone", () => {
	test("waiting statuses warn, review is in progress, outcomes split by who won", () => {
		expect(disputeTone("awaiting_seller")).toBe("warning");
		expect(disputeTone("open")).toBe("warning");
		expect(disputeTone("under_review")).toBe("primary");
		expect(disputeTone("resolved_split")).toBe("success");
		expect(disputeTone("resolved_seller")).toBe("neutral");
		expect(disputeTone("withdrawn")).toBe("neutral");
	});
});

describe("disputeDeadline", () => {
	test("follows the status", () => {
		expect(disputeDeadline({ status: "open", deadlines })).toBe(
			deadlines.submitBy,
		);
		expect(disputeDeadline({ status: "awaiting_buyer", deadlines })).toBe(
			deadlines.respondBy,
		);
		expect(disputeDeadline({ status: "under_review", deadlines })).toBe(
			deadlines.reviewDueAt,
		);
		expect(disputeDeadline({ status: "resolved_buyer", deadlines })).toBeNull();
	});
});

describe("messageAuthor", () => {
	test("the viewer's own side reads as self", () => {
		expect(messageAuthor("buyer", "buyer")).toBe("self");
		expect(messageAuthor("supplier", "seller")).toBe("self");
		expect(messageAuthor("moderator", "moderator")).toBe("self");
	});
	test("the other sides keep their label", () => {
		expect(messageAuthor("seller", "buyer")).toBe("shop");
		expect(messageAuthor("system", "buyer")).toBe("staff");
		expect(messageAuthor("buyer", "seller")).toBe("buyer");
	});
});
