import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import {
	addPendingPhotos,
	pendingPhotoFromAsset,
	REVIEW_PHOTO_ISSUE_KEYS,
	REVIEW_PHOTOS_MAX,
} from "./reviewPhotos";

function asset(name: string, mimeType = "image/jpeg", fileSize = 1000) {
	return pendingPhotoFromAsset({ uri: `file:///${name}`, mimeType, fileSize });
}

function lookup(tree: unknown, path: string): unknown {
	return path
		.split(".")
		.reduce<unknown>(
			(node, key) =>
				node && typeof node === "object"
					? (node as Record<string, unknown>)[key]
					: undefined,
			tree,
		);
}

describe("review form photos", () => {
	test("keeps up to five images and refuses the sixth", () => {
		const { photos, issue } = addPendingPhotos(
			[asset("a"), asset("b"), asset("c")],
			[asset("d"), asset("e"), asset("f")],
		);
		expect(photos).toHaveLength(REVIEW_PHOTOS_MAX);
		expect(photos.map((p) => p.uri)).not.toContain("file:///f");
		expect(issue).toBe("tooMany");
	});

	test("refuses a video, a HEIC left unconverted and an oversized photo", () => {
		expect(addPendingPhotos([], [asset("v", "video/mp4")]).issue).toBe(
			"invalidType",
		);
		expect(addPendingPhotos([], [asset("h", "image/heic")]).issue).toBe(
			"invalidType",
		);
		expect(
			addPendingPhotos([], [asset("big", "image/jpeg", 10 * 1024 * 1024 + 1)])
				.issue,
		).toBe("tooLarge");
	});

	test("an unknown size is left to the server", () => {
		const unknownSize = pendingPhotoFromAsset({
			uri: "file:///x",
			mimeType: "image/png",
		});
		expect(addPendingPhotos([], [unknownSize]).issue).toBeNull();
	});

	test("every refusal has a message in both languages", () => {
		for (const key of Object.values(REVIEW_PHOTO_ISSUE_KEYS)) {
			expect(typeof lookup(en, key)).toBe("string");
			expect(typeof lookup(fr, key)).toBe("string");
		}
	});
});
