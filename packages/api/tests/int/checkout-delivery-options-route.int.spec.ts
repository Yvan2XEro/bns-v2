// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The HTTP shell of `GET /api/checkout/delivery-options`. What the options
 * actually are is `listDeliveryOptions`'s own behaviour, covered against the
 * Payload fake in `checkout-quote.int.spec.ts`; here the service is a double,
 * so what is proved is the shell: the session gate, the query string reaching
 * the service, the body going back untouched and a business failure keeping
 * its code and status.
 */
const { auth, getPayloadMock, listDeliveryOptions } = vi.hoisted(() => {
	const auth = vi.fn();
	return {
		auth,
		getPayloadMock: vi.fn(async () => ({ auth })),
		listDeliveryOptions: vi.fn(),
	};
});

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));
// Replaced whole rather than spread over the real module: the route imports
// this one function, and loading the real service here would pull in the
// whole order stack for nothing — seconds of module load on the first test.
vi.mock("../../src/services/checkout", () => ({ listDeliveryOptions }));

import { ERROR_CODES } from "../../src/lib/errors";
import { ServiceError } from "../../src/lib/serviceError";

const { GET } = await import(
	"../../src/app/(frontend)/api/checkout/delivery-options/route"
);

const ANSWER = {
	city: "douala",
	options: [
		{
			optionId: "seller_delivery:douala",
			method: "seller_delivery",
			fee: 2000,
			etaText: "24-48h",
			codAllowed: true,
		},
		{
			optionId: "pickup:s-1",
			method: "pickup",
			fee: 0,
			etaText: "24-48h",
			codAllowed: true,
			pickupPoint: {
				address: "Rue Njo-Njo",
				landmark: "Face pharmacie",
				gps: { lat: 4.03, lng: 9.7 },
				hours: "08h-18h",
			},
		},
	],
};

beforeEach(() => {
	vi.clearAllMocks();
	auth.mockResolvedValue({ user: { id: "u-buyer", role: "user" } });
});

describe("GET /api/checkout/delivery-options", () => {
	it("answers the service's option list verbatim", async () => {
		listDeliveryOptions.mockResolvedValue(ANSWER);
		const response = await GET(
			new Request("http://x/api/checkout/delivery-options?city=douala"),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(ANSWER);
	});

	it("passes the city and district from the query string", async () => {
		listDeliveryOptions.mockResolvedValue(ANSWER);
		await GET(
			new Request(
				"http://x/api/checkout/delivery-options?city=yaounde&district=yaounde.bastos",
			),
		);

		expect(listDeliveryOptions).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ id: "u-buyer" }),
			{ city: "yaounde", district: "yaounde.bastos" },
		);
	});

	it("passes neither when the query string is empty, so the shop's city decides", async () => {
		listDeliveryOptions.mockResolvedValue(ANSWER);
		await GET(new Request("http://x/api/checkout/delivery-options"));

		expect(listDeliveryOptions).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			{ city: undefined, district: undefined },
		);
	});

	it("answers 401 without a session and never reaches the service", async () => {
		auth.mockResolvedValue({ user: null });
		const response = await GET(
			new Request("http://x/api/checkout/delivery-options"),
		);

		expect(response.status).toBe(401);
		expect((await response.json()).code).toBe("generic.unauthorized");
		expect(listDeliveryOptions).toHaveBeenCalledTimes(0);
	});

	it("keeps a business failure's own code and status", async () => {
		listDeliveryOptions.mockRejectedValue(
			new ServiceError(ERROR_CODES.checkoutDisabled, 403),
		);
		const response = await GET(
			new Request("http://x/api/checkout/delivery-options"),
		);

		expect(response.status).toBe(403);
		expect((await response.json()).code).toBe("checkout.disabled");
	});

	it("hides an unexpected failure behind generic.server", async () => {
		listDeliveryOptions.mockRejectedValue(
			new Error("ECONNREFUSED mongo:27017"),
		);
		const response = await GET(
			new Request("http://x/api/checkout/delivery-options"),
		);

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			code: "generic.server",
			message: "Something went wrong on our side. Please try again shortly.",
		});
	});
});
