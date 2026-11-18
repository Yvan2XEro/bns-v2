import { describe, expect, test } from "bun:test";
import { parsePhoneNumber } from "react-phone-number-input";
import {
	DEFAULT_PHONE_COUNTRY,
	emitPhone,
	readStoredPhone,
} from "./phone-input";

describe("readStoredPhone", () => {
	test("an already-E.164 value reads back correctly", () => {
		expect(readStoredPhone("+237677504218")).toBe("+237677504218");
	});

	// Regression guard: numbers already on file predate this control and are
	// not normalized server-side, so an older enrolment screen's shapes must
	// all resolve to the same number rather than being shown mangled.
	test("a stored value in a legacy shape resolves to the same number, not mangled", () => {
		for (const stored of [
			"+237 6 99 12 44 08",
			"699124408",
			"00237699124408",
		]) {
			expect(readStoredPhone(stored)).toBe("+237699124408");
		}
	});

	test("an empty control reads back as undefined, not a stray value", () => {
		expect(readStoredPhone("")).toBeUndefined();
	});

	test("a value that fails to parse is returned as-is rather than hidden", () => {
		expect(readStoredPhone("not-a-phone-number")).toBe("not-a-phone-number");
	});

	test("a foreign number parses under its own country, not the default", () => {
		expect(readStoredPhone("+33612345678")).toBe("+33612345678");
	});
});

describe("emitPhone", () => {
	test("an empty control (the library's undefined) emits the empty string, not a stray +", () => {
		expect(emitPhone(undefined)).toBe("");
	});

	test("a completed number passes through untouched", () => {
		expect(emitPhone("+237677504218")).toBe("+237677504218");
	});
});

describe("typing a national number under the default country", () => {
	// This is the conversion `PhoneInput.onChange` relies on: the library
	// resolves whatever the seller types, under the selected country, to
	// E.164 before this module ever sees it. Pinned here against the same
	// `parsePhoneNumber` call rather than a rendered component, since this
	// package has no component-render harness (see AGENTS.md).
	test("a Cameroonian mobile number typed with no prefix normalizes to E.164", () => {
		expect(parsePhoneNumber("699001122", DEFAULT_PHONE_COUNTRY)?.number).toBe(
			"+237699001122",
		);
	});
});
