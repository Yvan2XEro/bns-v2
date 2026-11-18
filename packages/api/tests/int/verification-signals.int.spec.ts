import { describe, expect, it } from "vitest";
import {
	computeSignals,
	isWellFormedNiu,
	namesOverlap,
	normalizeName,
	normalizeNiu,
	normalizeRegistrationNumber,
} from "../../src/lib/verificationSignals";

describe("name normalisation", () => {
	it("lowercases, strips accents and drops one-letter tokens", () => {
		expect(normalizeName("Aïcha M. MBAPPÉ")).toEqual(["aicha", "mbappe"]);
	});

	it("matches across word order and accents", () => {
		expect(namesOverlap("Aïcha Mbappé", "MBAPPE AICHA")).toBe(true);
		expect(namesOverlap("Aïcha Mbappé", "Jean Nkodo")).toBe(false);
	});

	it("does not match on an accidental short token", () => {
		expect(namesOverlap("Le Grand Marché", "De La Croix")).toBe(false);
	});
});

describe("registration numbers", () => {
	it("uppercases and collapses spaces", () => {
		expect(normalizeRegistrationNumber("  rc/dla/2020/b/ 1234 ")).toBe(
			"RC/DLA/2020/B/ 1234",
		);
		expect(normalizeNiu(" m0123 45678901x ")).toBe("M012345678901X");
	});

	it("knows a well-formed NIU from a merely plausible one", () => {
		expect(isWellFormedNiu("M012345678901X")).toBe(true);
		expect(isWellFormedNiu("MO12345678901X")).toBe(false);
		expect(isWellFormedNiu("M01234567890")).toBe(false);
	});
});

describe("computeSignals", () => {
	const base = {
		ownerName: "Aïcha Mbappé",
		shopId: "s-1",
		kyc: {
			status: "approved" as const,
			givenNames: "Aicha",
			familyName: "Mbappe",
			adult: true,
			documentNumberHash: "hash-a",
		},
		business: null,
		documentDuplicates: [],
		otherRequests: [],
	};

	it("is empty for a clean approved result", () => {
		expect(computeSignals(base)).toEqual([]);
	});

	it("flags an identity document already used by another person", () => {
		const signals = computeSignals({
			...base,
			otherRequests: [
				{
					id: "vr-9",
					shopId: "s-2",
					submittedById: "u-9",
					status: "approved",
					documentNumberHash: "hash-a",
					rccmNumber: null,
					niu: null,
				},
			],
		});
		expect(signals).toContainEqual({
			code: "identity_reused",
			detail: "u-9",
			relatedRequest: "vr-9",
		});
	});

	it("does not flag the same person re-verifying", () => {
		expect(
			computeSignals({
				...base,
				ownerId: "u-1",
				otherRequests: [
					{
						id: "vr-9",
						shopId: "s-2",
						submittedById: "u-1",
						status: "approved",
						documentNumberHash: "hash-a",
						rccmNumber: null,
						niu: null,
					},
				],
			}).map((s) => s.code),
		).not.toContain("identity_reused");
	});

	it("flags a name that shares no token with the account name", () => {
		expect(
			computeSignals({
				...base,
				kyc: { ...base.kyc, givenNames: "Jean", familyName: "Nkodo" },
			}).map((s) => s.code),
		).toContain("name_mismatch");
	});

	it("flags an underage holder", () => {
		expect(
			computeSignals({ ...base, kyc: { ...base.kyc, adult: false } }).map(
				(s) => s.code,
			),
		).toContain("underage");
	});

	it("flags the vendor's own declined and review outcomes", () => {
		expect(
			computeSignals({
				...base,
				kyc: { ...base.kyc, status: "declined" },
			}).map((s) => s.code),
		).toContain("kyc_declined");
		expect(
			computeSignals({ ...base, kyc: { ...base.kyc, status: "review" } }).map(
				(s) => s.code,
			),
		).toContain("kyc_review");
	});

	it("flags a document file already uploaded on another shop", () => {
		expect(
			computeSignals({
				...base,
				documentDuplicates: [{ documentId: "vd-9", shopId: "s-2" }],
			}).map((s) => s.code),
		).toContain("document_reused");
	});

	it("does not flag a duplicate file on the same shop", () => {
		expect(
			computeSignals({
				...base,
				documentDuplicates: [{ documentId: "vd-9", shopId: "s-1" }],
			}).map((s) => s.code),
		).not.toContain("document_reused");
	});

	it("flags an RCCM or NIU already declared by another shop", () => {
		const signals = computeSignals({
			...base,
			kyc: null,
			business: { rccmNumber: "RC/DLA/2020/B/1234", niu: "M012345678901X" },
			otherRequests: [
				{
					id: "vr-8",
					shopId: "s-2",
					submittedById: "u-8",
					status: "approved",
					documentNumberHash: null,
					rccmNumber: "RC/DLA/2020/B/1234",
					niu: null,
				},
				{
					id: "vr-7",
					shopId: "s-3",
					submittedById: "u-7",
					status: "submitted",
					documentNumberHash: null,
					rccmNumber: null,
					niu: "M012345678901X",
				},
			],
		});
		expect(signals.map((s) => s.code)).toEqual(
			expect.arrayContaining(["rccm_reused", "niu_reused"]),
		);
	});

	it("warns about a NIU shape without refusing it", () => {
		const signals = computeSignals({
			...base,
			kyc: null,
			business: { rccmNumber: null, niu: "BADNIU1234567" },
		});
		expect(signals.map((s) => s.code)).toContain("niu_format");
	});
});
