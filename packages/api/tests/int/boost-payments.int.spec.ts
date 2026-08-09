import { beforeEach, describe, expect, it, vi } from "vitest";
import { activateBoostPayment } from "../../src/lib/boostPayments";

describe("boost payment activation", () => {
	beforeEach(() => {
		vi.useRealTimers();
	});

	it("updates the listing before marking the payment as completed", async () => {
		const findByIDMock = vi
			.fn()
			.mockResolvedValueOnce({
				id: "payment-1",
				status: "pending",
				duration: "14",
				listing: "listing-1",
			})
			.mockResolvedValueOnce({
				id: "listing-1",
				boostedUntil: null,
			});
		const findMock = vi.fn();
		const updateMock = vi.fn().mockResolvedValue({});

		await activateBoostPayment({
			payload: {
				findByID: findByIDMock,
				find: findMock,
				update: updateMock,
			} as never,
			candidateReferences: ["BOOST-payment-1"],
		});

		expect(updateMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				collection: "listings",
				id: "listing-1",
				data: {
					boostedUntil: expect.any(String),
				},
			}),
		);
		expect(updateMock).toHaveBeenNthCalledWith(2, {
			collection: "boost-payments",
			id: "payment-1",
			data: { status: "completed" },
		});
	});

	it("repairs a completed payment when listing boost is missing", async () => {
		const findByIDMock = vi
			.fn()
			.mockResolvedValueOnce({
				id: "payment-1",
				status: "completed",
				duration: "14",
				listing: "listing-1",
			})
			.mockResolvedValueOnce({
				id: "listing-1",
				boostedUntil: null,
			});
		const findMock = vi.fn();
		const updateMock = vi.fn().mockResolvedValue({});

		await activateBoostPayment({
			payload: {
				findByID: findByIDMock,
				find: findMock,
				update: updateMock,
			} as never,
			candidateReferences: ["BOOST-payment-1"],
		});

		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: "listings",
				id: "listing-1",
				data: {
					boostedUntil: expect.any(String),
				},
			}),
		);
	});
});
