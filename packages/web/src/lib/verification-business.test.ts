import { describe, expect, it } from "bun:test";
import {
	businessSchema,
	canSubmit,
	MAX_DOCUMENT_FILE_SIZE,
	missingKinds,
	normalizeBusinessValues,
	requiredKinds,
	validateDocumentFile,
} from "./verification-business";

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

/** What `request.business` actually looks like coming back from
 * `lib/verificationView.ts`: a controlled input never holds `null`, but the
 * server returns an unfilled optional field as `null`, not `""` — and the
 * registration number the chosen business type does not use is always
 * unfilled. `canSubmit` and `businessSchema` must parse this shape directly,
 * since `business-client.tsx` feeds it in as-is. */
const serverBusiness = {
	...base,
	tradeName: null,
	entreprenantDeclarationNumber: null,
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

describe("document requirements", () => {
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
		expect(missingKinds(serverBusiness, [{ kind: "rccm_extract" }])).toEqual([
			"niu_certificate",
		]);
		expect(canSubmit(serverBusiness, [{ kind: "rccm_extract" }])).toBe(false);
		expect(
			canSubmit(serverBusiness, [
				{ kind: "rccm_extract" },
				{ kind: "niu_certificate" },
			]),
		).toBe(true);
	});

	it("does not let an invalid form submit even with every document present", () => {
		expect(
			canSubmit({ ...serverBusiness, legalName: "" }, [
				{ kind: "rccm_extract" },
				{ kind: "niu_certificate" },
			]),
		).toBe(false);
	});

	it("I1: submits with a null tradeName and a null unused registration number — the normal shape the server sends", () => {
		// A seller who picks "company" and never types a trade name, leaving the
		// entreprenant declaration number untouched, is the ordinary case. Both
		// fields come back from the server as `null`, never `""`.
		expect(
			canSubmit(serverBusiness, [
				{ kind: "rccm_extract" },
				{ kind: "niu_certificate" },
			]),
		).toBe(true);
	});
});

describe("validateDocumentFile", () => {
	const file = (type: string, size: number) =>
		new File([new Uint8Array(size)], "doc", { type });

	it("pins the same four MIME types and the same 10 MB limit the API enforces", () => {
		for (const type of [
			"image/jpeg",
			"image/png",
			"image/webp",
			"application/pdf",
		]) {
			expect(validateDocumentFile(file(type, 1024))).toBeNull();
		}
		expect(validateDocumentFile(file("text/plain", 1024))).toBe(
			"uploadInvalidType",
		);
		expect(
			validateDocumentFile(file("application/pdf", MAX_DOCUMENT_FILE_SIZE)),
		).toBeNull();
		expect(
			validateDocumentFile(file("application/pdf", MAX_DOCUMENT_FILE_SIZE + 1)),
		).toBe("uploadTooLarge");
	});
});
