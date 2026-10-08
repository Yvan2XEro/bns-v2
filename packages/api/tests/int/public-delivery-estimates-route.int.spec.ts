// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "../../src/lib/errors";
import { ServiceError } from "../../src/lib/serviceError";
import { fakePayload } from "./helpers/fakePayload";

const { getPayloadMock, estimates } = vi.hoisted(() => ({
	getPayloadMock: vi.fn(),
	estimates:
		vi.fn<
			typeof import("../../src/services/delivery/publicEstimates").publicDeliveryEstimates
		>(),
}));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (original) => ({
	...(await original<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));
vi.mock("../../src/services/delivery/publicEstimates", () => ({
	publicDeliveryEstimates: estimates,
}));
vi.mock("../../src/lib/delivery/estimateCache", () => ({
	getDeliveryEstimateCache: () => undefined,
}));

import { GET } from "../../src/app/(frontend)/api/public/listings/[id]/delivery-options/route";

describe("public listing delivery options route", () => {
	beforeEach(() => vi.resetAllMocks());
	it("supports anonymous visitors without requiring a login", async () => {
		const payload = fakePayload();
		getPayloadMock.mockResolvedValue(payload);
		estimates.mockResolvedValue({
			perMethod: [
				{ method: "pickup", cheapestFee: 0, etaMinHours: 2, etaMaxHours: 2 },
			],
		});
		const response = await GET(
			new Request(
				"http://localhost/api/public/listings/listing/delivery-options?city=douala",
			),
			{ params: Promise.resolve({ id: "listing" }) },
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			perMethod: [
				{ method: "pickup", cheapestFee: 0, etaMinHours: 2, etaMaxHours: 2 },
			],
		});
		expect(estimates).toHaveBeenCalledWith(
			payload,
			"listing",
			{ id: "listing", city: "douala", district: undefined },
			undefined,
			undefined,
		);
	});
	it("validates destinations before requesting delivery information", async () => {
		const response = await GET(
			new Request(
				"http://localhost/api/public/listings/listing/delivery-options?city=",
			),
			{ params: Promise.resolve({ id: "listing" }) },
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			code: ERROR_CODES.badRequest,
		});
	});
	it("returns the shared not-found response for inaccessible listings", async () => {
		getPayloadMock.mockResolvedValue(fakePayload());
		estimates.mockRejectedValue(new ServiceError(ERROR_CODES.notFound, 404));
		const response = await GET(
			new Request(
				"http://localhost/api/public/listings/listing/delivery-options",
			),
			{ params: Promise.resolve({ id: "listing" }) },
		);
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ code: ERROR_CODES.notFound });
	});
});
