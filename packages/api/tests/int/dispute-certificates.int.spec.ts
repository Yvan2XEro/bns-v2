// @vitest-environment node
import { describe, expect, it } from "vitest";
import { disputeCertificateLines } from "../../src/lib/disputeCertificateDocument";
import { renderTextPdf } from "../../src/lib/textPdf";
import { withTransaction } from "../../src/lib/transactions";
import type { Dispute, Order, Shop } from "../../src/payload-types";
import { renderDisputeCertificate } from "../../src/services/disputeCertificates";
import { fakePayload } from "./helpers/fakePayload";

const certificateDispute: Pick<Dispute, "number" | "status" | "resolution"> = {
	number: "DSP-2610-000001",
	status: "resolved_buyer",
	resolution: {
		outcome: "resolved_buyer",
		refundAmount: 11_000,
		publicStatement: {
			fr: "Le remboursement est accordé.",
			en: "The refund is granted.",
		},
	},
};
const certificateOrder: Pick<Order, "orderNumber"> = {
	orderNumber: "BNS-2026-001",
};
const certificateShop: Pick<Shop, "name" | "handle" | "legal"> = {
	name: "Shop One",
	handle: "shop-one",
	legal: {
		legalName: "Owner Private Legal Identity",
		rccmNumber: "RC-DLA-123",
		niu: "M012345678901A",
	},
};

function world(withRegistration = true) {
	return fakePayload({
		orders: [
			{
				id: "order-1",
				orderNumber: "BNS-2026-001",
				buyer: "buyer-1",
				shop: "shop-1",
			},
		],
		disputes: [
			{
				id: "dispute-1",
				number: "DSP-2610-000001",
				order: "order-1",
				shop: "shop-1",
				buyer: "buyer-1",
				status: "resolved_buyer",
				resolution: {
					outcome: "resolved_buyer",
					refundAmount: 11_000,
					publicStatement: {
						fr: "Le remboursement est accordé.",
						en: "The refund is granted.",
					},
				},
				effects: {},
			},
		],
		shops: [
			{
				id: "shop-1",
				handle: "shop-one",
				name: "Shop One",
				owner: "owner-1",
				legal: {
					legalName: "Owner Private Legal Identity",
					...(withRegistration
						? { rccmNumber: "RC-DLA-123", niu: "M012345678901A" }
						: {}),
				},
			},
		],
		"dispute-evidence": [],
		"moderation-log": [
			{
				id: "log-1",
				action: "dispute.resolve",
				targetType: "dispute",
				targetId: "dispute-1",
				metadata: {
					proofChecklist: [
						{ requirement: "handover_otp_verified", established: true },
					],
				},
			},
		],
	});
}

describe("dispute decision certificate", () => {
	it("renders bilingual recourse, shop identifiers, and no owner identity", () => {
		const payload = world();
		const dispute = payload.store.disputes?.[0];
		const order = payload.store.orders?.[0];
		const shop = payload.store.shops?.[0];
		if (!dispute || !order || !shop)
			throw new Error("certificate fixtures missing");
		const pdf = renderTextPdf(
			disputeCertificateLines({
				dispute: certificateDispute,
				order: certificateOrder,
				shop: certificateShop,
				proof: [{ requirement: "handover_otp_verified", established: true }],
			}),
		).toString("latin1");

		expect(pdf).toContain("RCCM: RC-DLA-123");
		expect(pdf).toContain("NIU: M012345678901A");
		expect(pdf).toContain("Shop One \\(@shop-one\\)");
		expect(pdf).toContain(
			"you may take the claim to a consumer association or the courts.",
		);
		expect(pdf).not.toContain("Owner Private Legal Identity");
	});

	it("omits missing registration fields and stores a single party-visible certificate", async () => {
		const payload = world(false);
		const first = await withTransaction(payload, (req) =>
			renderDisputeCertificate(req, "dispute-1"),
		);
		const second = await withTransaction(payload, (req) =>
			renderDisputeCertificate(req, "dispute-1"),
		);

		expect(first).toBe(second);
		expect(payload.store["dispute-evidence"]).toHaveLength(1);
		expect(payload.store["dispute-evidence"]?.[0]).toMatchObject({
			dispute: "dispute-1",
			uploadedByType: "system",
			kind: "document",
			visibility: "parties",
		});
		expect(payload.store.disputes?.[0]?.effects).toMatchObject({
			certificate: first,
		});
	});
});
