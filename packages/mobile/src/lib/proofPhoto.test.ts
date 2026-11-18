import { describe, expect, test } from "bun:test";
import {
	declareDeliveredBody,
	PROOF_MAX_BYTES,
	proofPhotoRefusal,
	riderLinkPhotoPath,
	shipmentPhotoPath,
} from "./proofPhoto";

describe("proofPhotoRefusal", () => {
	test("lets a JPEG at the limit through and refuses one byte over", () => {
		expect(
			proofPhotoRefusal({
				uri: "a",
				mimeType: "image/jpeg",
				fileSize: PROOF_MAX_BYTES,
			}),
		).toBeNull();
		expect(
			proofPhotoRefusal({
				uri: "a",
				mimeType: "image/jpeg",
				fileSize: PROOF_MAX_BYTES + 1,
			}),
		).toBe("size");
	});

	test("refuses a HEIC photo the collection would reject", () => {
		expect(proofPhotoRefusal({ uri: "a", mimeType: "image/heic" })).toBe(
			"type",
		);
	});

	test("treats a missing type as the camera's JPEG and a missing size as unknown", () => {
		expect(proofPhotoRefusal({ uri: "a" })).toBeNull();
	});
});

describe("riderLinkPhotoPath", () => {
	test("encodes the token into the landed route", () => {
		expect(riderLinkPhotoPath("a/b")).toBe("/api/public/rider/a%2Fb/photo");
	});
});

describe("shipmentPhotoPath", () => {
	test("targets the signed-in photo route and encodes the id", () => {
		expect(shipmentPhotoPath("s-1")).toBe("/api/shipments/s-1/photo");
		expect(shipmentPhotoPath("a/b")).toBe("/api/shipments/a%2Fb/photo");
	});
});

describe("declareDeliveredBody", () => {
	test("always carries the photo id and drops an empty note or missing fix", () => {
		expect(
			declareDeliveredBody({ photoId: "p-1", note: "  ", gps: null }),
		).toEqual({ photoId: "p-1" });
		expect(
			declareDeliveredBody({
				photoId: "p-1",
				note: " left with the guard ",
				gps: { lat: 4.05, lng: 9.7 },
			}),
		).toEqual({
			photoId: "p-1",
			note: "left with the guard",
			gps: { lat: 4.05, lng: 9.7 },
		});
	});
});
