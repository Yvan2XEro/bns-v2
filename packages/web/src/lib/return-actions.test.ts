import { describe, expect, it } from "bun:test";
import { returnActionRequest } from "./return-actions";

describe("returnActionRequest", () => {
	it("maps every action to the API route's actual path", () => {
		const actions = [
			"ship",
			"pickup",
			"receive",
			"inspect",
			"accept_deduction",
			"contest_deduction",
			"refund_proof",
			"confirm_refund",
			"contest_refund",
			"cancel",
		] as const;
		const paths = actions.map((action) => [
			action,
			returnActionRequest(action, undefined).endpoint,
		]);

		expect(paths).toEqual([
			["ship", "ship"],
			["pickup", "pickup"],
			["receive", "receive"],
			["inspect", "inspect"],
			["accept_deduction", "deduction"],
			["contest_deduction", "deduction"],
			["refund_proof", "refund-proof"],
			["confirm_refund", "confirm-refund"],
			["contest_refund", "contest-refund"],
			["cancel", "cancel"],
		]);
	});

	it("translates deduction actions into the route's validated request body", () => {
		expect(returnActionRequest("accept_deduction", null)).toEqual({
			endpoint: "deduction",
			body: { action: "accept" },
		});
		expect(returnActionRequest("contest_deduction", null)).toEqual({
			endpoint: "deduction",
			body: { action: "contest" },
		});
	});
});
