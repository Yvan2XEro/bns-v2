// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePayload } from "./helpers/fakePayload";

const getPayloadMock = vi.fn();
const verifyPaymentMock = vi.fn();

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => {
	const actual = await importOriginal<typeof import("payload")>();
	return { ...actual, getPayload: getPayloadMock };
});
vi.mock("../../src/lib/payments", () => ({
	getProvider: () => ({ verifyPayment: verifyPaymentMock }),
}));

let GET: (request: Request) => Promise<Response>;

beforeAll(async () => {
	({ GET } = await import(
		"../../src/app/(frontend)/api/public/boost/callback/route"
	));
}, 30_000);

const verified = (status: string, amount = 900) => ({
	reference: "PI-pi-1",
	status,
	amount,
	currency: "XAF",
	providerTransactionId: "trx.1",
});

const callback = (query: string) =>
	GET(new Request(`http://localhost:3000/api/public/boost/callback?${query}`));

describe("boost callback route", () => {
	let payload: ReturnType<typeof fakePayload>;

	beforeEach(() => {
		process.env.PUBLIC_WEB_URL = "https://buynsellem.com";
		verifyPaymentMock.mockReset();
		payload = fakePayload({
			listings: [{ id: "l-1", status: "published", boostedUntil: null }],
			"boost-payments": [
				{ id: "bp-1", listing: "l-1", duration: "14", status: "pending" },
			],
			"payment-intents": [
				{
					id: "pi-1",
					purpose: "boost",
					targetId: "bp-1",
					amount: 900,
					currency: "XAF",
					status: "pending",
					reference: "PI-pi-1",
					providerReference: "trx.1",
					statusHistory: [],
				},
			],
		});
		getPayloadMock.mockResolvedValue(payload);
	});

	it("settles a verified payment with source callback and redirects with success", async () => {
		verifyPaymentMock.mockResolvedValue(verified("succeeded"));
		const response = await callback(
			"provider=notchpay&reference=trx.1&trxref=PI-pi-1&listingId=l-1",
		);

		expect(verifyPaymentMock).toHaveBeenCalledWith("trx.1");
		expect(
			payload.store["payment-intents"][0].statusHistory.at(-1),
		).toMatchObject({
			status: "succeeded",
			source: "callback",
		});
		expect(payload.store["boost-payments"][0].status).toBe("completed");
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://buynsellem.com/listing/l-1?boostStatus=success",
		);
	});

	it("does not boost twice when the callback is replayed", async () => {
		verifyPaymentMock.mockResolvedValue(verified("succeeded"));
		await callback("provider=notchpay&reference=trx.1&listingId=l-1");
		const boosted = payload.store.listings[0].boostedUntil;

		const response = await callback(
			"provider=notchpay&reference=trx.1&listingId=l-1",
		);
		expect(payload.store.listings[0].boostedUntil).toBe(boosted);
		expect(response.headers.get("location")).toContain("boostStatus=success");
	});

	it("never settles an intent the provider did not itself confirm, even when trxref names one", async () => {
		payload = fakePayload({
			listings: [{ id: "l-2", status: "published", boostedUntil: null }],
			"boost-payments": [
				{ id: "bp-2", listing: "l-2", duration: "14", status: "pending" },
			],
			"payment-intents": [
				{
					id: "pi-2",
					purpose: "boost",
					targetId: "bp-2",
					amount: 900,
					currency: "XAF",
					status: "pending",
					reference: "PI-pi-2",
					providerReference: "trx.2",
					statusHistory: [],
				},
			],
		});
		getPayloadMock.mockResolvedValue(payload);
		// The provider confirms a payment but echoes neither a merchant
		// reference nor a provider transaction id that matches any intent.
		verifyPaymentMock.mockResolvedValue({
			reference: "",
			status: "succeeded",
			amount: 900,
			currency: "XAF",
			providerTransactionId: "trx.unknown",
		});

		const response = await callback(
			"provider=notchpay&reference=trx.unknown&trxref=PI-pi-2&listingId=l-2",
		);

		expect(payload.store["payment-intents"][0].status).toBe("pending");
		expect(payload.store["payment-intents"][0].statusHistory).toHaveLength(0);
		expect(payload.store["boost-payments"][0].status).toBe("pending");
		expect(payload.store.listings[0].boostedUntil).toBeNull();
		expect(response.headers.get("location")).toContain("boostStatus=failed");
	});

	it("reports pending while the provider has not confirmed", async () => {
		verifyPaymentMock.mockResolvedValue(verified("pending"));
		const response = await callback(
			"provider=notchpay&reference=trx.1&listingId=l-1",
		);
		expect(response.headers.get("location")).toContain("boostStatus=pending");
	});

	it("reports pending on an amount mismatch and failed on an unknown reference", async () => {
		verifyPaymentMock.mockResolvedValue(verified("succeeded", 100));
		expect(
			(
				await callback("provider=notchpay&reference=trx.1&listingId=l-1")
			).headers.get("location"),
		).toContain("boostStatus=pending");

		verifyPaymentMock.mockResolvedValue({
			...verified("succeeded"),
			reference: "PI-nope",
			providerTransactionId: "trx.nope",
		});
		expect(
			(
				await callback("provider=notchpay&reference=trx.nope&listingId=l-1")
			).headers.get("location"),
		).toContain("boostStatus=failed");
	});

	it("reports failed when verification throws", async () => {
		verifyPaymentMock.mockRejectedValue(new Error("NotchPay verify (503)"));
		const response = await callback(
			"provider=notchpay&reference=trx.1&listingId=l-1",
		);
		expect(response.headers.get("location")).toContain("boostStatus=failed");
	});

	it("returns to the app through the deep link", async () => {
		verifyPaymentMock.mockResolvedValue(verified("succeeded"));
		const response = await callback(
			"provider=notchpay&reference=trx.1&listingId=l-1&appReturnUrl=buynsellem%3A%2F%2Fboost%2Fcallback",
		);
		expect(await response.text()).toContain(
			"buynsellem://boost/callback?status=success&listingId=l-1",
		);
	});
});
