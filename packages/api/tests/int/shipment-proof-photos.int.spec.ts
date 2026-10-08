// @vitest-environment node
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../src/lib/transactions";
import type { Shipment } from "../../src/payload-types";
import { createSellerProofPhoto } from "../../src/services/delivery/proofPhotos";
import { fakePayload } from "./helpers/fakePayload";

const shipment: Shipment = {
	id: "shipment-photo-1",
	shipmentNumber: "SHP-2610-000031",
	order: "order-photo-1",
	storefrontShop: "shop-photo-1",
	fulfillingShop: "shop-photo-1",
	method: "seller_delivery",
	carrier: "self",
	origin: {},
	destination: {},
	fee: 0,
	status: "in_transit",
	createdAt: "2026-10-04T10:00:00.000Z",
	updatedAt: "2026-10-04T10:00:00.000Z",
};

describe("seller proof photos", () => {
	it("stores the photo against the shipment, uploaded by the seller", async () => {
		const api = fakePayload({ shipments: [shipment], "delivery-proofs": [] });
		const proof = await withTransaction(api, (req) =>
			createSellerProofPhoto(
				req,
				shipment,
				{
					kind: "declaration",
					file: {
						data: Buffer.from("jpeg"),
						name: "proof.jpg",
						mimetype: "image/jpeg",
						size: 4,
					},
				},
				"user-seller-1",
			),
		);
		expect(api.store["delivery-proofs"]).toHaveLength(1);
		expect(api.store["delivery-proofs"]?.[0]).toMatchObject({
			id: String(proof.id),
			shipment: "shipment-photo-1",
			kind: "declaration",
			uploadedBy: "user-seller-1",
			uploadedVia: "seller_app",
		});
	});
});
