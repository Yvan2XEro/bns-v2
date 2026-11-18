import { describe, expect, it } from "bun:test";
import { deliveryEstimateRequest } from "../../../api/src/contracts/deliveryEstimateQuery";

describe("public delivery estimate requests", () => {
	it("encodes the listing and destination without changing their values", () => {
		expect(deliveryEstimateRequest("listing/id", "buyer", "city name")).toEqual(
			{
				queryKey: [
					"listings",
					"listing/id",
					"delivery-estimates",
					"buyer",
					"city name",
				],
				path: "/api/public/listings/listing%2Fid/delivery-options?city=city+name",
			},
		);
	});
	it("leaves the default destination to the server for anonymous users", () => {
		expect(deliveryEstimateRequest("listing", null, null)).toEqual({
			queryKey: ["listings", "listing", "delivery-estimates", "", ""],
			path: "/api/public/listings/listing/delivery-options",
		});
	});
	it("separates estimates when the signed-in account changes", () => {
		expect(
			deliveryEstimateRequest("listing", "first", null).queryKey,
		).not.toEqual(deliveryEstimateRequest("listing", "second", null).queryKey);
		expect(
			deliveryEstimateRequest("listing", "second", "douala").queryKey,
		).toEqual([
			"listings",
			"listing",
			"delivery-estimates",
			"second",
			"douala",
		]);
	});
});
