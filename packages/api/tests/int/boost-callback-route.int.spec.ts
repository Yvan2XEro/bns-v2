import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const findByIDMock = vi.fn();
const findMock = vi.fn();
const updateMock = vi.fn();
const getPayloadMock = vi.fn();
const verifyPaymentMock = vi.fn();

vi.mock("@payload-config", () => ({
	default: {},
}));

vi.mock("payload", async (importOriginal) => {
	const actual = await importOriginal<typeof import("payload")>();

	return {
		...actual,
		getPayload: getPayloadMock,
	};
});

vi.mock("../../src/lib/payments", () => ({
	getNotchPayProvider: () => ({
		verifyPayment: verifyPaymentMock,
	}),
}));

describe("boost callback route", () => {
	beforeEach(() => {
		authMock.mockReset();
		findByIDMock.mockReset();
		findMock.mockReset();
		updateMock.mockReset();
		getPayloadMock.mockReset();
		verifyPaymentMock.mockReset();

		getPayloadMock.mockResolvedValue({
			auth: authMock,
			findByID: findByIDMock,
			find: findMock,
			update: updateMock,
		});

		process.env.PUBLIC_WEB_URL = "https://buynsellem.com";
	});

	it("activates boost via trxref when provider reference is returned in callback", async () => {
		verifyPaymentMock.mockResolvedValue("completed");
		findByIDMock
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

		const { GET } = await import(
			"../../src/app/(frontend)/api/public/boost/callback/route"
		);

		const response = await GET(
			new Request(
				"http://localhost:3000/api/public/boost/callback?provider=notchpay&reference=trx.123456&trxref=BOOST-payment-1&listingId=listing-1",
			),
		);

		expect(verifyPaymentMock).toHaveBeenCalledWith("trx.123456");
		expect(findByIDMock).toHaveBeenCalledWith({
			collection: "boost-payments",
			id: "payment-1",
		});
		expect(updateMock).toHaveBeenNthCalledWith(1, {
			collection: "listings",
			id: "listing-1",
			data: {
				boostedUntil: expect.any(String),
			},
		});
		expect(updateMock).toHaveBeenNthCalledWith(2, {
			collection: "boost-payments",
			id: "payment-1",
			data: { status: "completed" },
		});
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toContain(
			"https://buynsellem.com/listing/listing-1?boostStatus=success",
		);
	});

	it("returns failed when payment is completed but boost activation cannot resolve the payment", async () => {
		verifyPaymentMock.mockResolvedValue("completed");
		findByIDMock.mockResolvedValueOnce(null);
		findMock.mockResolvedValue({
			docs: [],
		});

		const { GET } = await import(
			"../../src/app/(frontend)/api/public/boost/callback/route"
		);

		const response = await GET(
			new Request(
				"http://localhost:3000/api/public/boost/callback?provider=notchpay&reference=trx.404&listingId=listing-404",
			),
		);

		expect(updateMock).not.toHaveBeenCalled();
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toContain(
			"https://buynsellem.com/listing/listing-404?boostStatus=failed",
		);
	});
});
