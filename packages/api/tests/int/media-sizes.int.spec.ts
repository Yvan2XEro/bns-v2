// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Media } from "../../src/collections/Media";
import { fitWithin, MEDIA_SIZES, mediaUrl } from "../../src/contracts/media";

const doc = {
	id: "m-1",
	url: "/media/photo.jpg",
	thumbnailURL: "/media/photo-480x360.webp",
	sizes: {
		thumbnail: { url: "/media/photo-480x360.webp" },
		medium: { url: "/media/photo-1280x960.webp" },
	},
};

describe("mediaUrl", () => {
	it("reads the requested size", () => {
		expect(mediaUrl(doc, "thumbnail")).toBe("/media/photo-480x360.webp");
		expect(mediaUrl(doc, "medium")).toBe("/media/photo-1280x960.webp");
		expect(mediaUrl(doc)).toBe("/media/photo.jpg");
	});

	it("falls back to the original for an upload from before sizes existed", () => {
		const old = { id: "m-0", url: "/media/old.jpg", sizes: {} };
		expect(mediaUrl(old, "thumbnail")).toBe("/media/old.jpg");
		expect(mediaUrl(old, "medium")).toBe("/media/old.jpg");
	});

	it("skips a size Payload left empty for a photo smaller than it", () => {
		const small = {
			url: "/media/small.jpg",
			sizes: {
				thumbnail: { url: "/media/small-480x300.webp" },
				medium: { url: null },
			},
		};
		expect(mediaUrl(small, "medium")).toBe("/media/small.jpg");
	});

	it("is null for a bare id or nothing", () => {
		expect(mediaUrl("m-1", "thumbnail")).toBeNull();
		expect(mediaUrl(null)).toBeNull();
		expect(mediaUrl({ url: "" })).toBeNull();
	});
});

describe("media collection", () => {
	it("writes one WebP copy per shared size and caps the original", () => {
		const upload = Media.upload;
		if (!upload || upload === true) throw new Error("media is an upload");
		expect(upload.imageSizes?.map((s) => [s.name, s.width])).toEqual(
			Object.entries(MEDIA_SIZES).map(([name, s]) => [name, s.width]),
		);
		expect(
			upload.imageSizes?.every((s) => s.formatOptions?.format === "webp"),
		).toBe(true);
		expect(upload.resizeOptions?.withoutEnlargement).toBe(true);
		expect(upload.adminThumbnail).toBe("thumbnail");
	});
});

describe("fitWithin", () => {
	it("brings a 12 MP photo's longest side down to 2048, ratio kept", () => {
		expect(fitWithin(4000, 3000)).toEqual({ width: 2048, height: 1536 });
		expect(fitWithin(3000, 4000)).toEqual({ width: 1536, height: 2048 });
	});

	it("never enlarges a small photo", () => {
		expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
	});
});
