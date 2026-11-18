import { describe, expect, test } from "bun:test";
import {
	contentLocaleHeaders,
	localeFromCookies,
	withContentLocale,
} from "./content-locale";

describe("content locale", () => {
	test("reads the reader's choice from the NEXT_LOCALE cookie", () => {
		expect(localeFromCookies("a=1; NEXT_LOCALE=en; b=2")).toBe("en");
		expect(localeFromCookies("NEXT_LOCALE=fr")).toBe("fr");
	});

	test("falls back to French when the cookie is missing or unknown", () => {
		expect(localeFromCookies(undefined)).toBe("fr");
		expect(localeFromCookies("")).toBe("fr");
		expect(localeFromCookies("NEXT_LOCALE=de")).toBe("fr");
		expect(localeFromCookies("XNEXT_LOCALE=en")).toBe("fr");
	});

	test("asks the API in that language", () => {
		expect(contentLocaleHeaders("en")).toEqual({ "Accept-Language": "en" });
		expect(withContentLocale("/api/listings/1?depth=2", "en")).toBe(
			"/api/listings/1?depth=2&locale=en",
		);
		expect(withContentLocale("/api/listings/1", "fr")).toBe(
			"/api/listings/1?locale=fr",
		);
	});
});
