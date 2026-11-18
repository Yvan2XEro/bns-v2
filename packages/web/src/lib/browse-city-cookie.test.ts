import { describe, expect, test } from "bun:test";
import type { Place } from "../../../api/src/contracts/places";
import {
	BROWSE_CITY_COOKIE,
	browseCityCookie,
	browseCityCookieValue,
	browseCityOf,
	readBrowseCity,
} from "./browse-city-cookie";

const yaounde: Place = { name: "Yaoundé", region: "Centre", source: "search" };

describe("browseCityOf", () => {
	test("is the remembered place while browsing it", () => {
		expect(browseCityOf({ place: yaounde, browseAll: false })).toBe("Yaoundé");
	});

	test("is null for every city or nothing remembered", () => {
		expect(browseCityOf({ place: yaounde, browseAll: true })).toBeNull();
		expect(browseCityOf({ place: null, browseAll: false })).toBeNull();
		expect(
			browseCityOf({ place: { ...yaounde, name: "  " }, browseAll: false }),
		).toBeNull();
	});
});

describe("browseCityCookie", () => {
	test("sets an encoded city for a year, site-wide", () => {
		const cookie = browseCityCookie("Yaoundé");
		expect(cookie).toStartWith(`${BROWSE_CITY_COOKIE}=Yaound%C3%A9;`);
		expect(cookie).toContain("Path=/");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 365}`);
	});

	test("clears it for every city", () => {
		expect(browseCityCookie(null)).toContain("Max-Age=0");
		expect(browseCityCookie(null)).toStartWith(`${BROWSE_CITY_COOKIE}=;`);
	});
});

describe("reading the cookie back", () => {
	test("round-trips what was written", () => {
		const header = `NEXT_LOCALE=fr; ${browseCityCookie("Yaoundé; Bastos").split(";")[0]}; other=1`;
		expect(readBrowseCity(browseCityCookieValue(header))).toBe(
			"Yaoundé; Bastos",
		);
	});

	test("is null when absent, empty, malformed or oversized", () => {
		expect(browseCityCookieValue("NEXT_LOCALE=fr")).toBeNull();
		expect(readBrowseCity(undefined)).toBeNull();
		expect(readBrowseCity("")).toBeNull();
		expect(readBrowseCity("%20")).toBeNull();
		expect(readBrowseCity("%E0%A4%A")).toBeNull();
		expect(readBrowseCity("a".repeat(121))).toBeNull();
	});
});
