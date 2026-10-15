import { describe, expect, test } from "bun:test";
import {
	emailIssue,
	firstIssueField,
	forgotIssues,
	loginIssues,
	orderedProviders,
	registerIssues,
	resetIssues,
	visibleIssues,
} from "./auth-form";

describe("emailIssue", () => {
	test.each([
		["", "emailRequired"],
		["   ", "emailRequired"],
		["ama", "emailInvalid"],
		["ama@", "emailInvalid"],
		["ama@mail", "emailInvalid"],
		["ama..k@mail.cm", "emailInvalid"],
		["ama k@mail.cm", "emailInvalid"],
		["ama@mail.cm", undefined],
		["ama.k+shop@mail.co.uk", undefined],
		[" ama@mail.cm ", undefined],
	])("%p -> %p", (email, issue) => {
		expect(emailIssue(email)).toBe(issue as never);
	});
});

describe("form rules", () => {
	test("login needs an email and any password", () => {
		expect(loginIssues({ email: "", password: "" })).toEqual({
			email: "emailRequired",
			password: "passwordRequired",
		});
		expect(loginIssues({ email: "a@b.cm", password: "x" })).toEqual({});
	});

	test("register checks name, email, length and confirmation", () => {
		expect(
			registerIssues({
				name: " ",
				email: "a@b",
				password: "short",
				confirmPassword: "",
			}),
		).toEqual({
			name: "nameRequired",
			email: "emailInvalid",
			password: "passwordMinLength",
			confirmPassword: "confirmRequired",
		});
		expect(
			registerIssues({
				name: "Ama",
				email: "a@b.cm",
				password: "longenough",
				confirmPassword: "longenougH",
			}),
		).toEqual({ confirmPassword: "passwordsDoNotMatch" });
		expect(
			registerIssues({
				name: "Ama",
				email: "a@b.cm",
				password: "longenough",
				confirmPassword: "longenough",
			}),
		).toEqual({});
	});

	test("forgot and reset", () => {
		expect(forgotIssues({ email: "" })).toEqual({ email: "emailRequired" });
		expect(resetIssues({ password: "", confirmPassword: "" })).toEqual({
			password: "passwordRequired",
			confirmPassword: "confirmRequired",
		});
		expect(
			resetIssues({ password: "12345678", confirmPassword: "12345678" }),
		).toEqual({});
	});
});

describe("display helpers", () => {
	test("only shown fields surface, following the current issue", () => {
		const all = {
			email: "emailInvalid",
			password: "passwordRequired",
		} as const;
		expect(visibleIssues(all, {})).toEqual({});
		expect(visibleIssues(all, { email: true })).toEqual({
			email: "emailInvalid",
		});
		expect(visibleIssues({}, { email: true, password: true })).toEqual({});
	});

	test("the first invalid field follows visual order", () => {
		const all = { password: "passwordRequired", name: "nameRequired" } as const;
		expect(
			firstIssueField(all, ["name", "email", "password", "confirmPassword"]),
		).toBe("name");
		expect(firstIssueField({}, ["email"])).toBeUndefined();
	});

	test("providers come in a fixed order and unknown ones drop", () => {
		expect(orderedProviders(["facebook", "twitter", "google"])).toEqual([
			"google",
			"facebook",
		]);
		expect(orderedProviders([])).toEqual([]);
	});
});
