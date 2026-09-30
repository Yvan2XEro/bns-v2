import { describe, expect, it } from "vitest";
import {
	addDocument,
	missingDocumentKinds,
	removeDocument,
	requiredDocumentKinds,
} from "../../src/services/verificationDocuments";
import { fakePayload } from "./helpers/fakePayload";

const OWNER = { id: "u-1", role: "user", name: "Aïcha" };
const file = (content: string) => ({
	data: Buffer.from(content),
	name: "rccm.pdf",
	mimetype: "application/pdf",
	size: content.length,
});

function seed(documents: Record<string, unknown>[] = []) {
	return fakePayload(
		{
			users: [{ ...OWNER }, { id: "u-2", role: "user", name: "Autre" }],
			shops: [
				{ id: "s-1", handle: "akwa", owner: "u-1", status: "active", level: 2 },
				{
					id: "s-2",
					handle: "autre",
					owner: "u-2",
					status: "active",
					level: 2,
				},
			],
			"verification-requests": [
				{
					id: "vr-1",
					shop: "s-1",
					submittedBy: "u-1",
					requestedLevel: 3,
					status: "draft",
					openKey: "s-1:3",
				},
			],
			"verification-documents": documents,
		},
		{
			globals: {
				"app-settings": {
					verification: {
						enabled: true,
						authorisation: { consentVersion: "v1" },
					},
				},
			},
		},
	);
}

const docs = (p: ReturnType<typeof seed>) => p.store["verification-documents"];

describe("requiredDocumentKinds", () => {
	it("asks an entreprenant for the declaration and the NIU certificate", () => {
		expect(
			requiredDocumentKinds({
				businessType: "entreprenant",
				legalRepresentativeIsOwner: true,
			}),
		).toEqual(["entreprenant_declaration", "niu_certificate"]);
	});

	it("asks every registered form for the RCCM extract and the NIU certificate", () => {
		for (const businessType of [
			"sole_trader",
			"company",
			"cooperative",
		] as const) {
			expect(
				requiredDocumentKinds({
					businessType,
					legalRepresentativeIsOwner: true,
				}),
			).toEqual(["rccm_extract", "niu_certificate"]);
		}
	});

	it("adds the representative's ID and the mandate when the owner is not the representative", () => {
		expect(
			requiredDocumentKinds({
				businessType: "company",
				legalRepresentativeIsOwner: false,
			}),
		).toEqual([
			"rccm_extract",
			"niu_certificate",
			"legal_representative_id",
			"mandate",
		]);
	});

	it("names exactly what is still missing", () => {
		const business = {
			businessType: "company" as const,
			legalRepresentativeIsOwner: true,
		};
		expect(missingDocumentKinds(business, [{ kind: "rccm_extract" }])).toEqual([
			"niu_certificate",
		]);
		expect(
			missingDocumentKinds(business, [
				{ kind: "rccm_extract" },
				{ kind: "niu_certificate" },
			]),
		).toEqual([]);
	});
});

describe("addDocument", () => {
	it("stores the sha256, the original filename and the uploader", async () => {
		const payload = seed();
		const doc = await addDocument(
			payload,
			OWNER,
			"vr-1",
			file("hello"),
			"rccm_extract",
		);
		expect(doc).toMatchObject({
			kind: "rccm_extract",
			shop: "s-1",
			request: "vr-1",
			uploadedBy: "u-1",
			originalFilename: "rccm.pdf",
		});
		expect(doc.sha256).toMatch(/^[0-9a-f]{64}$/);
	});

	it("links a file already uploaded on another shop", async () => {
		const payload = seed();
		const first = await addDocument(
			payload,
			OWNER,
			"vr-1",
			file("same"),
			"rccm_extract",
		);
		payload.store["verification-requests"].push({
			id: "vr-2",
			shop: "s-2",
			submittedBy: "u-2",
			requestedLevel: 3,
			status: "draft",
			openKey: "s-2:3",
		});
		const second = await addDocument(
			payload,
			{ id: "u-2", role: "user", name: "Autre" },
			"vr-2",
			file("same"),
			"rccm_extract",
		);
		expect(second.duplicateOf).toEqual([first.id]);
	});

	it("does not link the same shop's own earlier upload", async () => {
		const payload = seed();
		await addDocument(payload, OWNER, "vr-1", file("same"), "rccm_extract");
		const second = await addDocument(
			payload,
			OWNER,
			"vr-1",
			file("same"),
			"proof_of_address",
		);
		expect(second.duplicateOf).toEqual([]);
	});

	it("refuses an eleventh document", async () => {
		const payload = seed();
		for (let i = 0; i < 10; i++)
			await addDocument(payload, OWNER, "vr-1", file(`f${i}`), "other");
		await expect(
			addDocument(payload, OWNER, "vr-1", file("f10"), "other"),
		).rejects.toMatchObject({
			code: "verification.documentLimit",
			status: 409,
		});
	});

	it("refuses anyone but the owner, and any status but draft or needs_info", async () => {
		const payload = seed();
		await expect(
			addDocument(
				payload,
				{ id: "u-2", role: "user", name: "Autre" },
				"vr-1",
				file("x"),
				"other",
			),
		).rejects.toMatchObject({ code: "verification.notOwner", status: 403 });

		payload.store["verification-requests"][0].status = "in_review";
		await expect(
			addDocument(payload, OWNER, "vr-1", file("x"), "other"),
		).rejects.toMatchObject({
			code: "verification.invalidTransition",
			status: 409,
		});
	});
});

describe("removeDocument", () => {
	it("deletes the row for the owner in draft", async () => {
		const payload = seed();
		const doc = await addDocument(payload, OWNER, "vr-1", file("x"), "other");
		await removeDocument(payload, OWNER, "vr-1", doc.id);
		expect(docs(payload)).toHaveLength(0);
	});

	it("refuses a document belonging to another request", async () => {
		const payload = seed([
			{ id: "vd-x", request: "vr-other", shop: "s-2", kind: "other" },
		]);
		await expect(
			removeDocument(payload, OWNER, "vr-1", "vd-x"),
		).rejects.toMatchObject({
			code: "generic.notFound",
			status: 404,
		});
	});
});
