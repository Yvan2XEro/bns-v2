import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import { ERROR_CODES } from "./apiError";

/**
 * Guards the contract `resolveErrorMessage` depends on: every code
 * `apiError.ts` claims to handle must resolve under `apiErrors.<code>` in
 * both locale files, and the two locale files must offer the exact same set
 * of codes — a code present in only one language silently falls back to
 * English fallback text on the other, which is how `stock.insufficient`
 * went untranslated on mobile.
 */

type Json = { [key: string]: Json | string };

function leafPaths(node: Json, prefix = ""): string[] {
	return Object.entries(node).flatMap(([key, value]) => {
		const path = prefix ? `${prefix}.${key}` : key;
		return typeof value === "string" ? [path] : leafPaths(value, path);
	});
}

const apiErrorsEn = (en as Json).apiErrors as Json;
const apiErrorsFr = (fr as Json).apiErrors as Json;

describe("apiErrors locale coverage", () => {
	test("every mapped error code has an English translation", () => {
		const keys = new Set(leafPaths(apiErrorsEn));
		for (const code of Object.values(ERROR_CODES)) {
			expect(keys.has(code)).toBe(true);
		}
	});

	test("every mapped error code has a French translation", () => {
		const keys = new Set(leafPaths(apiErrorsFr));
		for (const code of Object.values(ERROR_CODES)) {
			expect(keys.has(code)).toBe(true);
		}
	});

	test("the two locale files expose the same apiErrors keys", () => {
		expect(leafPaths(apiErrorsEn).sort()).toEqual(
			leafPaths(apiErrorsFr).sort(),
		);
	});
});
