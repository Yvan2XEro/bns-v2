// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, getPayloadMock, service } = vi.hoisted(() => {
	const auth = vi.fn();
	return {
		auth,
		getPayloadMock: vi.fn(async () => ({ auth })),
		service: { payResellerCharge: vi.fn() },
	};
});

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));
vi.mock("../../src/services/purchaseOrders", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/services/purchaseOrders")
	>()),
	payResellerCharge: service.payResellerCharge,
}));

import { ERROR_CODES } from "../../src/lib/errors";
import { ServiceError } from "../../src/lib/serviceError";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = () =>
	new Request("http://x/api/reseller-charges/charge-1/pay", { method: "POST" });

beforeEach(() => {
	service.payResellerCharge.mockReset();
	auth.mockReset();
	auth.mockResolvedValue({ user: { id: "u-1", role: "user" } });
});

describe("POST /api/reseller-charges/[id]/pay", () => {
	it("requires an authenticated user", async () => {
		auth.mockResolvedValue({ user: null });
		const { POST } = await import(
			"../../src/app/(frontend)/api/reseller-charges/[id]/pay/route"
		);

		const response = await POST(post(), params("charge-1"));

		expect(response.status).toBe(401);
		expect(service.payResellerCharge).not.toHaveBeenCalled();
	});

	it("returns the provider checkout URL", async () => {
		service.payResellerCharge.mockResolvedValue({
			checkoutUrl: "https://pay.test/charge",
		});
		const { POST } = await import(
			"../../src/app/(frontend)/api/reseller-charges/[id]/pay/route"
		);

		const response = await POST(post(), params("charge-1"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			checkoutUrl: "https://pay.test/charge",
		});
		expect(service.payResellerCharge).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ id: "u-1" }),
			"charge-1",
		);
	});

	it("maps a charge that is no longer payable to 409", async () => {
		service.payResellerCharge.mockRejectedValue(
			new ServiceError(ERROR_CODES.resaleChargeNotPayable, 409),
		);
		const { POST } = await import(
			"../../src/app/(frontend)/api/reseller-charges/[id]/pay/route"
		);

		const response = await POST(post(), params("charge-1"));

		expect(response.status).toBe(409);
		expect((await response.json()).code).toBe(
			ERROR_CODES.resaleChargeNotPayable,
		);
	});
});
