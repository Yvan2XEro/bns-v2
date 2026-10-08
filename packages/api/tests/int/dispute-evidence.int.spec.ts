// @vitest-environment node
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	evidenceUrl,
	uploadEvidence,
} from "../../src/services/disputeEvidence";
import { fakePayload } from "./helpers/fakePayload";

const oldSecret = process.env.PAYLOAD_SECRET;

afterEach(() => {
	if (oldSecret === undefined) process.env.PAYLOAD_SECRET = undefined;
	else process.env.PAYLOAD_SECRET = oldSecret;
});

async function pngUpload() {
	const data = await sharp({
		create: { width: 2, height: 2, channels: 3, background: "white" },
	})
		.png()
		.toBuffer();
	return {
		data,
		name: "proof.png",
		mimetype: "image/png",
		size: data.byteLength,
	};
}

function parentPayload(extra: Record<string, unknown> = {}) {
	return fakePayload(
		{
			orders: [
				{
					id: "order-1",
					buyer: "buyer-1",
					shop: "shop-1",
					status: "delivered",
					paymentMethod: "cod",
				},
			],
			disputes: [
				{
					id: "dispute-1",
					order: "order-1",
					shop: "shop-1",
					buyer: "buyer-1",
					status: "open",
				},
			],
			"dispute-evidence": [],
			"dispute-evidence-views": [],
			"risk-signal-outbox": [],
			...extra,
		},
		{
			globals: {
				"app-settings": {
					disputes: { evidenceLimit: { perParty: 10, total: 30 } },
				},
			},
		},
	);
}

describe("case evidence", () => {
	it("stores transformed image bytes, original hash, and EXIF-stripped metadata", async () => {
		const payload = parentPayload();
		const source = await pngUpload();
		const evidence = await uploadEvidence(payload, {
			disputeId: "dispute-1",
			user: { id: "buyer-1", role: "user" },
			kind: "photo",
			file: source,
		});

		expect(evidence).toMatchObject({
			dispute: "dispute-1",
			uploadedBy: "buyer-1",
			uploadedByType: "buyer",
			kind: "photo",
			mimeType: "image/png",
			exifStripped: true,
			visibility: "parties",
		});
		expect(evidence.sha256).toHaveLength(64);
		expect(payload.files.get(String(evidence.id))).toBeInstanceOf(Uint8Array);
	});

	it("enforces per-party limits before writing another file", async () => {
		const payload = parentPayload({
			"dispute-evidence": Array.from({ length: 10 }, (_, index) => ({
				id: `e-${index}`,
				dispute: "dispute-1",
				uploadedBy: `buyer-account-${index}`,
				uploadedByType: "buyer",
				kind: "photo",
				sha256: `hash-${index}`,
			})),
		});

		await expect(
			uploadEvidence(payload, {
				disputeId: "dispute-1",
				user: { id: "buyer-1", role: "user" },
				kind: "photo",
				file: await pngUpload(),
			}),
		).rejects.toMatchObject({ code: "dispute.evidenceLimit", status: 409 });
		expect(payload.store["dispute-evidence"]).toHaveLength(10);
	});

	it("logs an evidence view before returning its five-minute signed URL", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-04T00:00:00.000Z"));
		process.env.PAYLOAD_SECRET = "test-signing-secret";
		const payload = parentPayload({
			"dispute-evidence": [
				{
					id: "evidence-1",
					dispute: "dispute-1",
					filename: "proof.png",
					mimeType: "image/png",
					visibility: "parties",
				},
			],
		});
		const now = Date.now();

		const result = await evidenceUrl(
			payload,
			{ id: "buyer-1", role: "user" },
			"evidence-1",
			{ userAgent: "test-agent" },
		);

		expect(result.url).toContain("/api/dispute-evidence/files/evidence-1?");
		expect(Date.parse(result.expiresAt) - now).toBeGreaterThan(299_000);
		expect(Date.parse(result.expiresAt) - now).toBeLessThanOrEqual(300_000);
		expect(payload.store["dispute-evidence-views"]).toHaveLength(1);
		expect(payload.store["dispute-evidence-views"]?.[0]).toMatchObject({
			evidence: "evidence-1",
			viewer: "buyer-1",
			viewerRole: "buyer",
			userAgent: "test-agent",
		});
	});

	it("hides staff-only evidence from parties without writing a view row", async () => {
		const payload = parentPayload({
			"dispute-evidence": [
				{
					id: "staff-evidence",
					dispute: "dispute-1",
					filename: "staff.pdf",
					mimeType: "application/pdf",
					visibility: "staff",
				},
			],
		});

		await expect(
			evidenceUrl(payload, { id: "buyer-1", role: "user" }, "staff-evidence"),
		).rejects.toMatchObject({ status: 404 });
		expect(payload.store["dispute-evidence-views"]).toHaveLength(0);
	});
});
