import { describe, expect, it } from "bun:test";
import { sellerReturnActions } from "./seller-return-actions";

describe("sellerReturnActions", () => {
	it("does not expose the seller tools when a buyer can only upload evidence", () => {
		expect(sellerReturnActions(["upload_evidence"])).toEqual([]);
	});
	it("exposes only seller-side actions from the server-authorized action list", () => {
		expect(
			sellerReturnActions([
				"ship",
				"receive",
				"inspect",
				"confirm_refund",
				"refund_proof",
			]),
		).toEqual(["receive", "inspect", "refund_proof"]);
	});
});
