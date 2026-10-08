import { describe, expect, it } from "bun:test";
import {
	pickupHours,
	pickupPointsRequest,
} from "../../../api/src/contracts/publicPickupPoint";

describe("public pickup points", () => {
	it("encodes the handle and scopes the cache to the shop", () => {
		expect(pickupPointsRequest("a/b")).toEqual({
			queryKey: ["shops", "a/b", "pickup-points"],
			path: "/api/public/shops/a%2Fb/pickup-points",
		});
	});
	it("formats weekday names in the viewer language without timezone drift", () => {
		const hours = [{ day: "mon" as const, opens: "09:00", closes: "17:00" }];
		expect(pickupHours(hours, "en")).toEqual(["Mon: 09:00-17:00"]);
		expect(pickupHours(hours, "fr")).toEqual(["lun.: 09:00-17:00"]);
	});
	it("does not invent opening hours", () => {
		expect(pickupHours(null, "en")).toEqual([]);
		expect(pickupHours(undefined, "fr")).toEqual([]);
	});
});
