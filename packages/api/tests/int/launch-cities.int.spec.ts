// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	districtKeysOf,
	districtLabel,
	isDistrictKey,
	isLaunchCityKey,
	LAUNCH_CITIES,
	LAUNCH_CITY_KEYS,
} from "../../src/lib/launchCities";
import { codCaps } from "../../src/lib/shopCapabilities";

describe("launch cities", () => {
	it("serves Douala at 2 000 and Yaoundé at 3 500", () => {
		expect(LAUNCH_CITY_KEYS).toEqual(["douala", "yaounde"]);
		expect(LAUNCH_CITIES.douala.defaultDeliveryFee).toBe(2000);
		expect(LAUNCH_CITIES.yaounde.defaultDeliveryFee).toBe(3500);
		expect(LAUNCH_CITIES.yaounde.label).toBe("Yaoundé");
	});

	it("lists twenty districts per city, keyed by city", () => {
		expect(districtKeysOf("douala")).toHaveLength(20);
		expect(districtKeysOf("yaounde")).toHaveLength(20);
		expect(districtKeysOf("douala")).toContain("douala.akwa");
		expect(districtKeysOf("douala")).toContain("douala.bonamoussadi");
		expect(districtKeysOf("yaounde")).toContain("yaounde.biyem-assi");
	});

	it("accepts {city}.other and rejects another city's district", () => {
		expect(isDistrictKey("douala", "douala.other")).toBe(true);
		expect(isDistrictKey("douala", "yaounde.bastos")).toBe(false);
		expect(isDistrictKey("douala", "douala.nowhere")).toBe(false);
	});

	it("labels a district key and answers null for an unknown one", () => {
		expect(districtLabel("douala.deido")).toBe("Deïdo");
		expect(districtLabel("yaounde.centre-ville")).toBe("Centre-ville");
		expect(districtLabel("douala.other")).toBe("Autre");
		expect(districtLabel("kribi.centre")).toBeNull();
	});

	it("rejects a non-launch city", () => {
		expect(isLaunchCityKey("douala")).toBe(true);
		expect(isLaunchCityKey("kribi")).toBe(false);
		expect(isLaunchCityKey(null)).toBe(false);
	});
});

describe("codCaps", () => {
	it("gives no caps at level 0, because level 0 has no COD at all", () => {
		expect(codCaps(0)).toBeNull();
	});

	it("answers the spec's three rows", () => {
		expect(codCaps(1)).toEqual({
			maxOrderTotal: 150_000,
			maxDailyOrders: 20,
			maxOpenOrders: 30,
		});
		expect(codCaps(2)).toEqual({
			maxOrderTotal: 500_000,
			maxDailyOrders: 100,
			maxOpenOrders: 200,
		});
		expect(codCaps(3)).toEqual({
			maxOrderTotal: 2_000_000,
			maxDailyOrders: 500,
			maxOpenOrders: 1_000,
		});
	});

	it("takes a per-level override without losing the other fields", () => {
		expect(codCaps(1, { 1: { maxOrderTotal: 90_000 } })).toEqual({
			maxOrderTotal: 90_000,
			maxDailyOrders: 20,
			maxOpenOrders: 30,
		});
	});
});
