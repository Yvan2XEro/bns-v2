import { describe, expect, it } from "vitest";
import {
	assertAuthorised,
	getVerificationSettings,
} from "../../src/lib/verificationSettings";
import { fakePayload } from "./helpers/fakePayload";

const GRANTED = {
	reference: "ANTIC-2026-0042",
	grantedAt: "2026-09-01T00:00:00.000Z",
	transfersAuthorised: true,
	consentVersion: "kyc-2026-10-v1",
};

describe("assertAuthorised", () => {
	it("passes when every authorisation field is recorded", () => {
		expect(
			assertAuthorised({ enabled: true, authorisation: GRANTED }, {}),
		).toBeNull();
	});

	it("refuses enabling without a reference, a date, a consent version or the transfer tick", () => {
		for (const missing of [
			"reference",
			"grantedAt",
			"consentVersion",
		] as const) {
			const authorisation = { ...GRANTED, [missing]: "" };
			expect(assertAuthorised({ enabled: true, authorisation }, {})).toContain(
				missing,
			);
		}
		expect(
			assertAuthorised(
				{
					enabled: true,
					authorisation: { ...GRANTED, transfersAuthorised: false },
				},
				{},
			),
		).toContain("transfersAuthorised");
	});

	it("never refuses when the feature is being left off", () => {
		expect(
			assertAuthorised({ enabled: false, authorisation: {} }, {}),
		).toBeNull();
	});

	it("lets staging bypass it, and ignores the bypass in production", () => {
		const env = {
			VERIFICATION_ALLOW_UNAUTHORISED: "true",
			NODE_ENV: "staging",
		};
		expect(
			assertAuthorised({ enabled: true, authorisation: {} }, env),
		).toBeNull();
		expect(
			assertAuthorised(
				{ enabled: true, authorisation: {} },
				{ ...env, NODE_ENV: "production" },
			),
		).not.toBeNull();
	});
});

describe("getVerificationSettings", () => {
	it("reads the group", async () => {
		const payload = fakePayload(
			{},
			{
				globals: {
					"app-settings": {
						verification: {
							enabled: true,
							kycProvider: "didit",
							autoApproveIdentity: true,
							authorisation: GRANTED,
						},
					},
				},
			},
		);
		expect(await getVerificationSettings(payload)).toEqual({
			enabled: true,
			kycProvider: "didit",
			autoApproveIdentity: true,
			consentVersion: "kyc-2026-10-v1",
		});
	});

	it("fails closed when the global is unreadable", async () => {
		const payload = fakePayload({});
		payload.findGlobal = async () => {
			throw new Error("mongo down");
		};
		expect(await getVerificationSettings(payload)).toEqual({
			enabled: false,
			kycProvider: "didit",
			autoApproveIdentity: false,
			consentVersion: null,
		});
	});
});
