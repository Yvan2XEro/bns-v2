import { describe, expect, test } from "bun:test";
import { ssoRequested } from "./social-auth-buttons";

describe("ssoRequested", () => {
	test("shows the SSO for ?sso=overbrand and ?sso=ob", () => {
		expect(ssoRequested("overbrand")).toBe(true);
		expect(ssoRequested("ob")).toBe(true);
		expect(ssoRequested(" OB ")).toBe(true);
	});

	test("hides it otherwise", () => {
		expect(ssoRequested(null)).toBe(false);
		expect(ssoRequested("")).toBe(false);
		expect(ssoRequested("google")).toBe(false);
	});
});
