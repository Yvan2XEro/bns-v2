import { describe, expect, it } from "vitest";
import {
	DOCUMENT_KINDS,
	MAX_DOCUMENTS_PER_REQUEST,
	MAX_VERIFICATION_FILE_SIZE,
	VERIFICATION_MIME_TYPES,
	VerificationDocuments,
} from "../../src/collections/VerificationDocuments";
import { VerificationDocumentViews } from "../../src/collections/VerificationDocumentViews";
import { enforceUploadLimits } from "../../src/hooks/mediaLimits";
import { peppered, sha256 } from "../../src/lib/hash";

const ADMIN = { req: { user: { id: "a-1", role: "admin" } } };
const MOD = { req: { user: { id: "m-1", role: "moderator" } } };
const OWNER = { req: { user: { id: "u-1", role: "user" } } };

describe("verification-documents access", () => {
	it("refuses every operation to everyone, admins included", () => {
		for (const op of ["read", "create", "update", "delete"] as const) {
			const access = VerificationDocuments.access?.[op] as (
				a: unknown,
			) => unknown;
			for (const ctx of [OWNER, MOD, ADMIN]) expect(access(ctx)).toBe(false);
		}
	});

	it("is hidden from the admin panel", () => {
		expect(VerificationDocuments.admin?.hidden).toBe(true);
	});

	it("takes PDFs as well as the three image types, at 10 MB", () => {
		expect([...VERIFICATION_MIME_TYPES]).toEqual([
			"image/jpeg",
			"image/png",
			"image/webp",
			"application/pdf",
		]);
		expect(MAX_VERIFICATION_FILE_SIZE).toBe(10 * 1024 * 1024);
		expect(MAX_DOCUMENTS_PER_REQUEST).toBe(10);
		expect([...DOCUMENT_KINDS]).toEqual([
			"rccm_extract",
			"entreprenant_declaration",
			"niu_certificate",
			"legal_representative_id",
			"mandate",
			"proof_of_address",
			"other",
		]);
	});

	it("keeps no image sizes, crop or focal point", () => {
		expect(VerificationDocuments.upload).toMatchObject({
			imageSizes: [],
			crop: false,
			focalPoint: false,
			disableLocalStorage: false,
		});
	});
});

describe("verification-document-views access", () => {
	it("is readable by admins only and never writable", () => {
		const read = VerificationDocumentViews.access?.read as (
			a: unknown,
		) => unknown;
		expect(read(ADMIN)).toBe(true);
		expect(read(MOD)).toBe(false);
		for (const op of ["create", "update", "delete"] as const) {
			expect(
				(VerificationDocumentViews.access?.[op] as (a: unknown) => unknown)(
					ADMIN,
				),
			).toBe(false);
		}
	});
});

describe("enforceUploadLimits", () => {
	const hook = enforceUploadLimits({
		mimeTypes: ["application/pdf"],
		maxBytes: 100,
	});
	const run = (file: { mimetype: string; size: number } | undefined) =>
		(hook as (a: { operation: string; req: { file?: unknown } }) => unknown)({
			operation: "create",
			req: { file },
		});

	it("refuses a type outside the list with upload.invalidType", () => {
		expect(() => run({ mimetype: "image/gif", size: 10 })).toThrow(
			expect.objectContaining({
				status: 400,
				data: { code: "upload.invalidType" },
			}),
		);
	});

	it("refuses a file over the limit with upload.tooLarge", () => {
		expect(() => run({ mimetype: "application/pdf", size: 101 })).toThrow(
			expect.objectContaining({
				status: 413,
				data: { code: "upload.tooLarge" },
			}),
		);
	});

	it("lets an allowed file through and ignores an operation with no file", () => {
		expect(() => run({ mimetype: "application/pdf", size: 100 })).not.toThrow();
		expect(() => run(undefined)).not.toThrow();
	});
});

describe("hash helpers", () => {
	it("hashes deterministically and differently per input", () => {
		expect(sha256("abc")).toBe(sha256("abc"));
		expect(sha256("abc")).not.toBe(sha256("abd"));
		expect(sha256("abc")).toMatch(/^[0-9a-f]{64}$/);
	});

	it("peppers with the configured secret, so the same input differs across peppers", () => {
		process.env.VERIFICATION_HASH_PEPPER = "pepper-a";
		const a = peppered("123456789");
		process.env.VERIFICATION_HASH_PEPPER = "pepper-b";
		expect(peppered("123456789")).not.toBe(a);
	});

	it("refuses to hash without a pepper, rather than hashing with an empty key", () => {
		process.env.VERIFICATION_HASH_PEPPER = "";
		expect(() => peppered("123456789")).toThrow(/VERIFICATION_HASH_PEPPER/);
	});
});
