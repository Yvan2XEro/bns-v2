import { describe, expect, it } from "vitest";
import {
	businessDetailsComplete,
	type RequirementRequestInput,
	verificationRequirements,
} from "../../src/contracts/verificationRequirements";

const COMPLETE_BUSINESS = {
	businessType: "company" as const,
	legalName: "Akwa SARL",
	rccmNumber: "RC/DLA/2024/B/123",
	entreprenantDeclarationNumber: null,
	niu: "M012345678901A",
	registeredAddress: "Rue Joss",
	city: "Douala",
	legalRepresentativeName: "Paul Ndi",
	legalRepresentativeIsOwner: true,
};

function request(
	patch: Partial<RequirementRequestInput>,
): RequirementRequestInput {
	return {
		status: "draft",
		kyc: null,
		business: null,
		documents: [],
		...patch,
	};
}

describe("businessDetailsComplete", () => {
	it("requires the registration number that matches the business type", () => {
		expect(businessDetailsComplete(COMPLETE_BUSINESS)).toBe(true);
		expect(
			businessDetailsComplete({
				...COMPLETE_BUSINESS,
				businessType: "entreprenant",
			}),
		).toBe(false);
		expect(businessDetailsComplete({ ...COMPLETE_BUSINESS, city: "  " })).toBe(
			false,
		);
		expect(businessDetailsComplete(null)).toBe(false);
	});
});

describe("verificationRequirements", () => {
	it("asks level 2 for an identity document and a selfie, missing with no request", () => {
		expect(verificationRequirements(2, null)).toEqual([
			{ key: "identity_document", status: "missing" },
			{ key: "selfie", status: "missing" },
		]);
	});

	it("follows the identity vendor's progress on level 2", () => {
		expect(
			verificationRequirements(
				2,
				request({
					status: "submitted",
					kyc: { status: "pending", livenessPassed: true },
				}),
			),
		).toEqual([
			{ key: "identity_document", status: "in_review" },
			{ key: "selfie", status: "in_review" },
		]);
		expect(
			verificationRequirements(
				2,
				request({ kyc: { status: "declined", livenessPassed: false } }),
			).map((item) => item.status),
		).toEqual(["rejected", "rejected"]);
	});

	it("names the registration document generically until a business type is chosen", () => {
		expect(verificationRequirements(3, null)).toEqual([
			{ key: "business_details", status: "missing" },
			{ key: "registration_document", status: "missing" },
			{ key: "niu_certificate", status: "missing" },
		]);
	});

	it("lists the documents the business type and representative require, with what is on file", () => {
		expect(
			verificationRequirements(
				3,
				request({
					business: {
						...COMPLETE_BUSINESS,
						legalRepresentativeIsOwner: false,
					},
					documents: [{ kind: "rccm_extract" }, { kind: "mandate" }],
				}),
			),
		).toEqual([
			{ key: "business_details", status: "provided" },
			{ key: "rccm_extract", status: "provided" },
			{ key: "niu_certificate", status: "missing" },
			{ key: "legal_representative_id", status: "missing" },
			{ key: "mandate", status: "provided" },
		]);
	});

	it("starts from nothing after a rejected request", () => {
		expect(
			verificationRequirements(
				3,
				request({
					status: "rejected",
					business: COMPLETE_BUSINESS,
					documents: [{ kind: "rccm_extract" }],
				}),
			).every((item) => item.status === "missing"),
		).toBe(true);
	});
});
