import { describe, expect, test } from "bun:test";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import {
	addPendingPhotos,
	pendingPhoto,
	populatedReviewPhotos,
	REVIEW_PHOTO_ISSUE_KEYS,
	REVIEW_PHOTOS_MAX,
} from "./review-photos";

function photo(name: string, type = "image/jpeg", bytes = 10) {
	return pendingPhoto(
		new File([new Uint8Array(bytes)], name, { type }),
		name,
		`blob:${name}`,
	);
}

describe("review form photos", () => {
	test("keeps up to five images and refuses the rest as too many", () => {
		const first = addPendingPhotos(
			[],
			["a", "b", "c", "d"].map((n) => photo(n)),
		);
		expect(first.issue).toBeNull();
		const second = addPendingPhotos(first.photos, [photo("e"), photo("f")]);
		expect(second.photos.map((p) => p.key)).toEqual(["a", "b", "c", "d", "e"]);
		expect(second.photos).toHaveLength(REVIEW_PHOTOS_MAX);
		expect(second.issue).toBe("tooMany");
	});

	test("refuses a non-image or an oversized file before any upload", () => {
		expect(addPendingPhotos([], [photo("v.mp4", "video/mp4")])).toEqual({
			photos: [],
			issue: "invalidType",
		});
		expect(addPendingPhotos([], [photo("i.svg", "image/svg+xml")]).issue).toBe(
			"invalidType",
		);
		expect(
			addPendingPhotos(
				[],
				[photo("big.jpg", "image/jpeg", 10 * 1024 * 1024 + 1)],
			).issue,
		).toBe("tooLarge");
	});

	test("every refusal has a message in both languages", () => {
		for (const key of Object.values(REVIEW_PHOTO_ISSUE_KEYS)) {
			expect(en.Purchases).toHaveProperty(key);
			expect(fr.Purchases).toHaveProperty(key);
		}
	});

	test("reads only populated media off a review", () => {
		expect(
			populatedReviewPhotos([
				{ id: "m1", url: "/api/media/file/a.jpg" },
				"m2",
				null,
			]),
		).toEqual([{ id: "m1", url: "/api/media/file/a.jpg" }]);
		expect(populatedReviewPhotos(undefined)).toEqual([]);
	});
});
