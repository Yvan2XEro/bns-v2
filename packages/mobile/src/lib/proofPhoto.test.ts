import { describe, expect, test } from "bun:test";
import {
	PROOF_MAX_BYTES,
	proofPhotoRefusal,
	riderLinkPhotoPath,
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
