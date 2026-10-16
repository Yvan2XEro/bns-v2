import { describe, expect, mock, test } from "bun:test";

mock.module("expo", () => ({ requireOptionalNativeModule: () => null }));
mock.module("expo-file-system", () => ({ File: class {} }));

const { shouldShrinkAsset } = await import("./mediaUpload");

describe("shouldShrinkAsset", () => {
	test("scales down a photo over the 2048 px cap", () => {
		expect(
			shouldShrinkAsset({
				uri: "file:///a.jpg",
				mimeType: "image/jpeg",
				width: 4032,
				height: 3024,
			}),
		).toBe(true);
	});

	test("sends a photo already within the cap untouched", () => {
		expect(
			shouldShrinkAsset({
				uri: "file:///a.jpg",
				mimeType: "image/jpeg",
				width: 1600,
				height: 1200,
			}),
		).toBe(false);
	});

	test("always converts a HEIC, which the API refuses", () => {
		expect(
			shouldShrinkAsset({ uri: "file:///a.heic", mimeType: "image/heic" }),
		).toBe(true);
	});

	test("never touches a PNG, whose transparency a JPEG would lose", () => {
		expect(
			shouldShrinkAsset({
				uri: "file:///logo.png",
				mimeType: "image/png",
				width: 4000,
				height: 4000,
			}),
		).toBe(false);
	});
});
