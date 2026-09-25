// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePayload } from "./helpers/fakePayload";

const getPayloadMock = vi.fn();
const createPaymentMock = vi.fn();

vi.mock("@payload-config", () => ({ default: {} }));
// The "@payload-config" mock does not stop the app router from loading the
// real config from route.ts's dynamic import (a pre-existing limitation
// shared with every other route test in this suite), so `payload`'s real
// exports (APIError, etc.) must survive for the real collections it drags in.
vi.mock("payload", async (importOriginal) => {
	const actual = await importOriginal<typeof import("payload")>();
	return { ...actual, getPayload: getPayloadMock };
});
vi.mock("../../src/lib/payments", () => ({
	getProvider: () => ({ id: "notchpay", createPayment: createPaymentMock }),
}));

let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
	({ POST } = await import("../../src/app/(frontend)/api/public/boost/route"));
}, 30_000);

function call(body: Record<string, unknown>) {
	return POST(
		new Request("http://localhost:3000/api/public/boost", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("POST /api/public/boost", () => {
	let payload: ReturnType<typeof fakePayload>;

	beforeEach(() => {
		payload = fakePayload({
			listings: [
				{ id: "l-mine", title: "A", seller: "u-1", status: "published" },
				{ id: "l-other", title: "B", seller: "u-2", status: "published" },
				{ id: "l-draft", title: "C", seller: "u-1", status: "draft" },
			],
		});
		payload.auth.mockResolvedValue({
			user: { id: "u-1", email: "s@example.com" },
		});
		getPayloadMock.mockResolvedValue(payload);
		createPaymentMock.mockResolvedValue({
			checkoutUrl: "https://pay.test/c",
			providerReference: "trx.9",
		});
	});

	it("answers 401 to a guest", async () => {
		payload.auth.mockResolvedValue({ user: null });
		expect((await call({ listingId: "l-mine", duration: "7" })).status).toBe(
			401,
		);
	});

	it("answers 403 boost.notOwner for someone else's listing", async () => {
		const response = await call({ listingId: "l-other", duration: "7" });
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "boost.notOwner" });
	});

	it("answers 409 boost.listingNotPublished for an unpublished listing", async () => {
		const response = await call({ listingId: "l-draft", duration: "7" });
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			code: "boost.listingNotPublished",
		});
	});

	it("returns the checkout for the owner", async () => {
		const response = await call({ listingId: "l-mine", duration: "7" });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			provider: "notchpay",
			checkoutUrl: "https://pay.test/c",
		});
	});
});
