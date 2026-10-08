import { afterEach, describe, expect, it, vi } from "vitest";
import { NotchPayProvider } from "../../src/lib/payments/notchpay";

describe("NotchPay reseller transfers", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("sends platform-balance transfers with the payout reference and idempotency key", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({ transfer: { id: "tr_1", reference: "RP-payout-1" } }),
				{ status: 202 },
			),
		);
		vi.stubGlobal("fetch", fetchMock);
		const provider = new NotchPayProvider("public", "https://notch.test", undefined, "grant");

		const result = await provider.createTransfer({
			reference: "RP-payout-1",
			amount: 12_000,
			currency: "XAF",
			channel: "cm.mtn",
			phone: "+237670000001",
			name: "Reseller",
			idempotencyKey: "reseller-payout:payout-1",
		});

		expect(result).toEqual({ transferId: "tr_1", reference: "RP-payout-1" });
		expect(fetchMock).toHaveBeenCalledWith(
			"https://notch.test/transfers",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "public",
					"X-Grant": "grant",
					"Idempotency-Key": "reseller-payout:payout-1",
				}),
				body: JSON.stringify({
					reference: "RP-payout-1",
					amount: 12_000,
					currency: "XAF",
					channel: "cm.mtn",
					phone: "+237670000001",
					name: "Reseller",
				}),
			}),
		);
	});
});
