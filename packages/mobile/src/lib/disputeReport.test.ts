import { describe, expect, test } from "bun:test";
import { requestedDisputeAmount } from "./disputeReport";

describe("requested dispute amount", () => {
	test("requires a positive integer for partial refunds", () => {
		expect(requestedDisputeAmount("partial_refund", "", 1000)).toEqual({
			valid: false,
			reason: "required",
		});
		expect(requestedDisputeAmount("partial_refund", "250", 1000)).toEqual({
			valid: true,
			amount: 250,
		});
	});

	test("rejects partial amounts above the order's refundable ceiling", () => {
		expect(requestedDisputeAmount("partial_refund", "1001", 1000)).toEqual({
			valid: false,
			reason: "over_limit",
		});
	});

	test("omits an amount for non-partial outcomes", () => {
		expect(requestedDisputeAmount("full_refund", "", 1000)).toEqual({
			valid: true,
		});
	});
});
