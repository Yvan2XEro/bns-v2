import { describe, expect, test } from "bun:test";
import { shopContactsSchema, toNullablePhone } from "./shop-form";

describe("shopContactsSchema", () => {
	test("an empty phone and whatsapp are both accepted", () => {
		const result = shopContactsSchema.safeParse({
			phone: "",
			whatsapp: "",
			email: "",
		});
		expect(result.success).toBe(true);
	});

	test("a valid E.164 phone and whatsapp both pass, exactly what PhoneInput emits", () => {
		const result = shopContactsSchema.safeParse({
			phone: "+237677504218",
			whatsapp: "+237677504218",
			email: "",
		});
		expect(result.success).toBe(true);
	});

	test("a national-format phone (no +) is rejected", () => {
		expect(
			shopContactsSchema.safeParse({
				phone: "677504218",
				whatsapp: "",
				email: "",
			}).success,
		).toBe(false);
	});

	test("a malformed whatsapp number is rejected", () => {
		expect(
			shopContactsSchema.safeParse({
				phone: "",
				whatsapp: "+237 677 504 218",
				email: "",
			}).success,
		).toBe(false);
	});

	// Mutation-checks the shared E164_PATTERN bound (`[1-9]\d{7,14}`), the same
	// one phoneNumberSchema pins in phone-verification.test.ts: one digit short
	// or over on either end is rejected, so a weakened bound is caught here too.
	test("accepts the shortest E.164 shape and rejects one digit short", () => {
		expect(
			shopContactsSchema.safeParse({
				phone: "+12345678",
				whatsapp: "",
				email: "",
			}).success,
		).toBe(true);
		expect(
			shopContactsSchema.safeParse({
				phone: "+1234567",
				whatsapp: "",
				email: "",
			}).success,
		).toBe(false);
	});

	test("accepts the longest E.164 shape and rejects one digit over", () => {
		expect(
			shopContactsSchema.safeParse({
				phone: "",
				whatsapp: "+123456789012345",
				email: "",
			}).success,
		).toBe(true);
		expect(
			shopContactsSchema.safeParse({
				phone: "",
				whatsapp: "+1234567890123456",
				email: "",
			}).success,
		).toBe(false);
	});
});

describe("toNullablePhone", () => {
	test("an empty contact field stays empty and serialises to null", () => {
		expect(toNullablePhone("")).toBeNull();
	});

	test("a valid E.164 value passes through untouched, never a stray +", () => {
		expect(toNullablePhone("+237677504218")).toBe("+237677504218");
	});
});
