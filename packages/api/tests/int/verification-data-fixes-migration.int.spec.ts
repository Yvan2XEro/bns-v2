import { describe, expect, it, vi } from "vitest";
import { up } from "../../src/migrations/20260930_000100_p2_verification_data_fixes";

function fakeMongo() {
	const requests: Record<string, unknown>[] = [
		{
			// Already-fixed adapter output: a fraction that happens to be > 1 is
			// impossible, but a value already in 0-100 (e.g. a past whole-number
			// percentage above 1) must be left alone.
			_id: "vr-new",
			status: "approved",
			updatedAt: new Date("2026-09-01T00:00:00.000Z"),
			kyc: { faceMatchScore: 93 },
		},
		{
			// Old reading: the vendor's own 0..1 fraction.
			_id: "vr-old-fraction",
			status: "approved",
			updatedAt: new Date("2026-09-01T00:00:00.000Z"),
			kyc: { faceMatchScore: 0.97 },
		},
		{
			_id: "vr-lowercase-niu",
			status: "draft",
			updatedAt: new Date("2026-09-01T00:00:00.000Z"),
			business: { niu: "m012312345678n" },
		},
		{
			_id: "vr-already-uppercase-niu",
			status: "draft",
			updatedAt: new Date("2026-09-01T00:00:00.000Z"),
			business: { niu: "M012312345678N" },
		},
		{
			// Terminal, but only two days past terminal: not yet due for the
			// five-year row strip, so its vendorWarnings must survive.
			_id: "vr-recent-terminal",
			status: "rejected",
			updatedAt: new Date(Date.now() - 2 * 86_400_000),
			kyc: { vendorWarnings: ["face_match_below_threshold"] },
		},
		{
			// Terminal for well over five years: due, and still carrying
			// vendorWarnings the old job never cleared.
			_id: "vr-overdue-terminal",
			status: "rejected",
			updatedAt: new Date(Date.now() - (5 * 365 + 10) * 86_400_000),
			kyc: { vendorWarnings: ["document_number_illegible"] },
		},
		{
			// Open (non-terminal): never in scope for the row strip, whatever its age.
			_id: "vr-open-old",
			status: "draft",
			updatedAt: new Date(Date.now() - 6 * 365 * 86_400_000),
			kyc: { vendorWarnings: ["document_number_illegible"] },
		},
	];
	const documents: Record<string, unknown>[] = [
		{
			_id: "vd-purged",
			purgedAt: new Date("2026-06-01T00:00:00.000Z"),
			originalFilename: "carte-identite-aicha.pdf",
		},
		{
			_id: "vd-not-purged",
			purgedAt: null,
			originalFilename: "carte-identite-jean.pdf",
		},
	];

	const collection = (docs: Record<string, unknown>[]) => ({
		find: () => ({ toArray: async () => docs }),
		updateOne: vi.fn(
			async (
				filter: { _id: string },
				update: { $set?: Record<string, unknown> },
			) => {
				const doc = docs.find((d) => d._id === filter._id);
				if (doc && update.$set) {
					for (const [path, value] of Object.entries(update.$set)) {
						const parts = path.split(".");
						let target = doc as Record<string, unknown>;
						for (let i = 0; i < parts.length - 1; i++) {
							target = target[parts[i]] as Record<string, unknown>;
						}
						target[parts[parts.length - 1]] = value;
					}
				}
			},
		),
	});

	return {
		requests,
		documents,
		payload: {
			logger: { info: vi.fn(), error: vi.fn() },
			db: {
				collections: {
					"verification-requests": { collection: collection(requests) },
					"verification-documents": { collection: collection(documents) },
				},
			},
		},
	};
}

describe("p2 verification data fixes migration", () => {
	it("converts an old 0..1 faceMatchScore fraction to a 0-100 percentage, leaving an already-converted row alone", async () => {
		const { payload, requests } = fakeMongo();
		await up({ payload } as never);
		expect(requests.find((r) => r._id === "vr-old-fraction")).toMatchObject({
			kyc: { faceMatchScore: 97 },
		});
		expect(requests.find((r) => r._id === "vr-new")).toMatchObject({
			kyc: { faceMatchScore: 93 },
		});
	});

	it("upper-cases a stored niu that was never upper-cased, leaving an already-uppercase one untouched", async () => {
		const { payload, requests } = fakeMongo();
		await up({ payload } as never);
		expect(requests.find((r) => r._id === "vr-lowercase-niu")).toMatchObject({
			business: { niu: "M012312345678N" },
		});
		expect(
			requests.find((r) => r._id === "vr-already-uppercase-niu"),
		).toMatchObject({ business: { niu: "M012312345678N" } });
	});

	it("clears vendorWarnings on a terminal row already past its five-year row-strip date, leaving a recent or open one alone", async () => {
		const { payload, requests } = fakeMongo();
		await up({ payload } as never);
		expect(
			(
				requests.find((r) => r._id === "vr-overdue-terminal") as {
					kyc: { vendorWarnings: unknown };
				}
			).kyc.vendorWarnings,
		).toBeNull();
		expect(
			(
				requests.find((r) => r._id === "vr-recent-terminal") as {
					kyc: { vendorWarnings: unknown };
				}
			).kyc.vendorWarnings,
		).toEqual(["face_match_below_threshold"]);
		expect(
			(
				requests.find((r) => r._id === "vr-open-old") as {
					kyc: { vendorWarnings: unknown };
				}
			).kyc.vendorWarnings,
		).toEqual(["document_number_illegible"]);
	});

	it("clears originalFilename on a document already purged, leaving one not yet purged alone", async () => {
		const { payload, documents } = fakeMongo();
		await up({ payload } as never);
		expect(documents.find((d) => d._id === "vd-purged")).toMatchObject({
			originalFilename: null,
		});
		expect(documents.find((d) => d._id === "vd-not-purged")).toMatchObject({
			originalFilename: "carte-identite-jean.pdf",
		});
	});
});
