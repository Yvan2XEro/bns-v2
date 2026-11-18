import { describe, expect, it } from "bun:test";
import {
	businessSchema,
	canSubmit,
	isAcceptedDocument,
	MAX_DOCUMENT_FILE_SIZE,
	missingKinds,
	normalizeBusinessValues,
	requiredKinds,
	toBusinessValues,
} from "./verificationBusiness";

const base = {
	businessType: "company" as const,
	legalName: "AKWA SARL",
	tradeName: "",
	rccmNumber: "RC/DLA/2020/B/1234",
	entreprenantDeclarationNumber: "",
	niu: "M012345678901X",
	registeredAddress: "Rue Njo-Njo, Bonapriso",
	city: "Douala",
	legalRepresentativeName: "Aïcha Mbappé",
	legalRepresentativeIsOwner: true,
};

describe("businessSchema", () => {
	it("accepts a complete company", () => {
		expect(businessSchema.safeParse(base).success).toBe(true);
	});

	it("requires an RCCM for a company and a declaration for an entreprenant", () => {
		expect(businessSchema.safeParse({ ...base, rccmNumber: "" }).success).toBe(
			false,
		);
		expect(
			businessSchema.safeParse({
				...base,
				businessType: "entreprenant",
				rccmNumber: "",
				entreprenantDeclarationNumber: "DE/DLA/2021/1234",
			}).success,
		).toBe(true);
	});

	it("requires a legal name of at least two characters and at most 120", () => {
		expect(businessSchema.safeParse({ ...base, legalName: "A" }).success).toBe(
			false,
		);
		expect(
			businessSchema.safeParse({ ...base, legalName: "A".repeat(121) }).success,
		).toBe(false);
	});

	it("requires exactly 14 alphanumeric characters for the NIU", () => {
		expect(
			businessSchema.safeParse({ ...base, niu: "M01234567890" }).success,
		).toBe(false);
		expect(
			businessSchema.safeParse({ ...base, niu: "M012345678901!" }).success,
		).toBe(false);
	});

	it("accepts a NIU of the right shape that does not match the usual pattern", () => {
		// The server turns that into a niu_format signal for a reviewer; it is
		// not the form's job to refuse a number a tax office actually issued.
		expect(
			businessSchema.safeParse({ ...base, niu: "ABCDEFGHIJKLMN" }).success,
		).toBe(true);
	});
});

describe("normalizeBusinessValues", () => {
	it("uppercases and collapses the registration numbers", () => {
		expect(
			normalizeBusinessValues({
				...base,
				rccmNumber: "  rc/dla/2020/b/ 1234 ",
				niu: " m0123 45678901x ",
			}),
		).toMatchObject({
			rccmNumber: "RC/DLA/2020/B/ 1234",
			niu: "M012345678901X",
		});
	});

	it("leaves the human-typed fields alone", () => {
		expect(
			normalizeBusinessValues({
				...base,
				legalRepresentativeName: "  Aïcha Mbappé  ",
			}).legalRepresentativeName,
		).toBe("Aïcha Mbappé");
	});
});

describe("document requirements (re-exported from ./verification, Task 27)", () => {
	it("asks for the right kinds per business type", () => {
		expect(requiredKinds("entreprenant", true)).toEqual([
			"entreprenant_declaration",
			"niu_certificate",
		]);
		expect(requiredKinds("company", true)).toEqual([
			"rccm_extract",
			"niu_certificate",
		]);
		expect(requiredKinds("company", false)).toEqual([
			"rccm_extract",
			"niu_certificate",
			"legal_representative_id",
			"mandate",
		]);
	});

	it("names what is still missing and gates submit on it", () => {
		expect(missingKinds(base, [{ kind: "rccm_extract" }])).toEqual([
			"niu_certificate",
		]);
		expect(canSubmit(base, [{ kind: "rccm_extract" }])).toBe(false);
		expect(
			canSubmit(base, [{ kind: "rccm_extract" }, { kind: "niu_certificate" }]),
		).toBe(true);
	});

	it("does not let an incomplete form submit even with every document present", () => {
		expect(
			canSubmit({ ...base, legalName: "" }, [
				{ kind: "rccm_extract" },
				{ kind: "niu_certificate" },
			]),
		).toBe(false);
	});
});

describe("toBusinessValues", () => {
	it("treats an unset server field as not yet provided", () => {
		expect(
			toBusinessValues({
				businessType: null,
				legalName: null,
				tradeName: null,
				rccmNumber: null,
				entreprenantDeclarationNumber: null,
				niu: null,
				registeredAddress: null,
				city: null,
				legalRepresentativeName: null,
				legalRepresentativeIsOwner: true,
			}),
		).toEqual({
			businessType: "company",
			legalName: "",
			tradeName: "",
			rccmNumber: "",
			entreprenantDeclarationNumber: "",
			niu: "",
			registeredAddress: "",
			city: "",
			legalRepresentativeName: "",
			legalRepresentativeIsOwner: true,
		});
	});
});

describe("pickVerificationDocument result shape", () => {
	it("refuses a type outside the four before any upload", () => {
		expect(isAcceptedDocument({ mimeType: "image/gif", size: 10 })).toEqual({
			ok: false,
			code: "upload.invalidType",
		});
		expect(
			isAcceptedDocument({ mimeType: "application/pdf", size: 10 }),
		).toEqual({ ok: true });
	});

	it("refuses a file over 10 MB before any upload", () => {
		expect(
			isAcceptedDocument({
				mimeType: "application/pdf",
				size: MAX_DOCUMENT_FILE_SIZE + 1,
			}),
		).toEqual({ ok: false, code: "upload.tooLarge" });
		expect(
			isAcceptedDocument({
				mimeType: "application/pdf",
				size: MAX_DOCUMENT_FILE_SIZE,
			}),
		).toEqual({ ok: true });
	});

	it("refuses a picker result with no size rather than uploading blind", () => {
		expect(
			isAcceptedDocument({ mimeType: "application/pdf", size: null }),
		).toEqual({ ok: false, code: "upload.invalidType" });
	});
});
