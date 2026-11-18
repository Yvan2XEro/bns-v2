import { describe, expect, it } from "bun:test";
import type { ReturnCaseView } from "../../../api/src/contracts/returns";
import { returnFlowState } from "./return-flow";

const baseView: ReturnCaseView = {
	id: "return-1",
	number: "RET-001",
	orderId: "order-1",
	orderNumber: "ORD-001",
	basis: "withdrawal",
	status: "awaiting_shipment",
	returnRequired: true,
	returnMethod: "buyer_drop_off",
	returnTracking: null,
	items: [],
	reasonText: null,
	deadlines: {
		requestDeadline: null,
		shipBy: "2026-10-05T00:00:00.000Z",
		pickupBy: null,
		inspectBy: null,
		deductionRespondBy: null,
		refundBy: null,
	},
	returnShippingPaidBy: "buyer",
	refund: {
		amount: 0,
		breakdown: {
			goods: 0,
			outboundDelivery: 0,
			returnShipping: 0,
			buyerProtectionFee: 0,
			deduction: 0,
		},
		channel: null,
		providerRefundStatus: null,
		sellerProof: null,
		buyerConfirmedAt: null,
		contestedAt: null,
	},
	disputeId: null,
	rejectionReason: null,
	timeline: [],
	allowedActions: ["ship", "cancel"],
};

describe("returnFlowState", () => {
	it("uses the server view's status and deadline without recomputing refund amounts", () => {
		const state = returnFlowState(
			baseView,
			new Date("2026-10-04T00:00:00.000Z"),
		);

		expect(state).toEqual({
			step: "shipping",
			nextDeadline: "2026-10-05T00:00:00.000Z",
			remainingMs: 86_400_000,
			deductionResponseRemainingMs: null,
			returnShippingPaidBy: "buyer",
			actions: ["ship", "cancel"],
		});
	});

	it("keeps expired deadlines at zero and identifies seller-paid shipping from the view", () => {
		const view: ReturnCaseView = {
			...baseView,
			basis: "non_conformity",
			returnShippingPaidBy: "seller",
			status: "inspected",
			deadlines: { ...baseView.deadlines, shipBy: "2026-10-03T00:00:00.000Z" },
			refund: {
				...baseView.refund,
				breakdown: { ...baseView.refund.breakdown, returnShipping: 500 },
			},
			allowedActions: ["accept_deduction", "contest_deduction"],
		};

		const state = returnFlowState(view, new Date("2026-10-04T00:00:00.000Z"));

		expect(state.step).toBe("refund");
		expect(state.nextDeadline).toBeNull();
		expect(state.remainingMs).toBeNull();
		expect(state.returnShippingPaidBy).toBe("seller");
		expect(state.deductionResponseRemainingMs).toBeNull();
	});
});
