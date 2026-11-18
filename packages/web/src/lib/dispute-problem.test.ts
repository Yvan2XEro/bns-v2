import { describe, expect, it } from "bun:test";
import { toOpenDisputePayload } from "./dispute-problem";

describe("toOpenDisputePayload", () => {
	it("submits only selected items with positive quantities", () => {
		expect(
			toOpenDisputePayload({
				reason: "damaged",
				subject: "goods",
				description: "The item arrived with a broken screen.",
				requestedOutcome: "return_and_refund",
				requestedAmount: undefined,
				items: [
					{ orderItemId: "item-a", quantity: 1 },
					{ orderItemId: "item-b", quantity: 0 },
				],
			}),
		).toEqual({
			reason: "damaged",
			subject: "goods",
			description: "The item arrived with a broken screen.",
			requestedOutcome: "return_and_refund",
			items: [{ orderItemId: "item-a", quantity: 1 }],
		});
	});
});
