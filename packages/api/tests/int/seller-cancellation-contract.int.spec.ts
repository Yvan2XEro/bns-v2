import { describe, expect, it } from "vitest";
import {
	cancellationRefundsBuyer,
	SELLER_CANCELLATION_MIN_ORDERS,
	SELLER_CANCELLATION_THRESHOLD,
	sellerCancellationAlert,
} from "../../src/contracts/sellerCancellation";

describe("sellerCancellationAlert", () => {
	it("alerts at the threshold once enough orders were placed", () => {
		expect(SELLER_CANCELLATION_THRESHOLD).toBe(0.1);
		expect(SELLER_CANCELLATION_MIN_ORDERS).toBe(5);
		expect(sellerCancellationAlert(1, 10)).toBe(true);
		expect(sellerCancellationAlert(1, 11)).toBe(false);
		expect(sellerCancellationAlert(4, 4)).toBe(false);
	});
});

describe("cancellationRefundsBuyer", () => {
	it("refunds a paid protected order only", () => {
		expect(
			cancellationRefundsBuyer({
				paymentMethod: "mobile_money",
				paymentStatus: "paid",
			}),
		).toBe(true);
		expect(
			cancellationRefundsBuyer({
				paymentMethod: "mobile_money",
				paymentStatus: "partially_refunded",
			}),
		).toBe(true);
		expect(
			cancellationRefundsBuyer({
				paymentMethod: "mobile_money",
				paymentStatus: "pending",
			}),
		).toBe(false);
		expect(
			cancellationRefundsBuyer({
				paymentMethod: "cod",
				paymentStatus: "cod_pending",
			}),
		).toBe(false);
	});
});
