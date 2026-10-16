import { describe, expect, test } from "bun:test";
import { shouldShrink } from "./media-upload";

describe("shouldShrink", () => {
	const MB = 1024 * 1024;

	test("re-encodes an oversized or heavy JPEG/WebP", () => {
		expect(shouldShrink({ type: "image/jpeg", size: MB }, 4000, 3000)).toBe(
			true,
		);
		expect(shouldShrink({ type: "image/webp", size: 3 * MB }, 1600, 1200)).toBe(
			true,
		);
	});

	test("leaves a light photo within the cap alone", () => {
		expect(shouldShrink({ type: "image/jpeg", size: MB }, 1600, 1200)).toBe(
			false,
		);
	});

	test("never touches a PNG, whose transparency a JPEG would lose", () => {
		expect(shouldShrink({ type: "image/png", size: 5 * MB }, 4000, 3000)).toBe(
			false,
		);
	});
});
