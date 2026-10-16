import { describe, expect, test } from "bun:test";
import {
	contentLocale,
	setContentLocale,
	withContentLocale,
} from "./contentLocale";

describe("content locale", () => {
	test("follows the app language and reports a change once", () => {
		setContentLocale("fr");
		expect(setContentLocale("en")).toBe(true);
		expect(contentLocale()).toBe("en");
		expect(setContentLocale("en")).toBe(false);
		expect(setContentLocale("de")).toBe(true);
		expect(contentLocale()).toBe("fr");
		expect(setContentLocale(undefined)).toBe(false);
	});

	test("adds locale= for Payload's REST routes", () => {
		setContentLocale("en");
		expect(withContentLocale("/api/listings/1?depth=2")).toBe(
			"/api/listings/1?depth=2&locale=en",
		);
		expect(withContentLocale("/api/listings/1", "fr")).toBe(
			"/api/listings/1?locale=fr",
		);
		setContentLocale("fr");
	});
});
