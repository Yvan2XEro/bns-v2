// @vitest-environment node
import { ObjectId } from "bson";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
	addReviewPhotos,
	REVIEW_PHOTO_MAX_BYTES,
	REVIEW_PHOTO_MIME_TYPES,
	REVIEW_PHOTOS_MAX,
	reviewPhotoIssue,
} from "../../src/contracts/reviewPhotos";
import {
	ALLOWED_MEDIA_MIME_TYPES,
	MAX_MEDIA_FILE_SIZE,
} from "../../src/hooks/mediaLimits";
import { publicShopReviews } from "../../src/services/shopReviews";
import { fakePayload } from "./helpers/fakePayload";

vi.mock("payload", () => ({
	APIError: class APIError extends Error {
		constructor(
			message: string,
			public status: number,
			public data: unknown,
			public isPublic: boolean,
		) {
			super(message);
		}
	},
}));

let enforceReviewRules: (args: any) => Promise<any>;
let removeReviewPhoto: typeof import("../../src/services/reviewModeration").removeReviewPhoto;
let photoIds: typeof import("../../src/services/reviewPhotos").photoIds;
beforeAll(async () => {
	({ enforceReviewRules } = await import("../../src/hooks/reviews"));
	({ removeReviewPhoto } = await import("../../src/services/reviewModeration"));
	({ photoIds } = await import("../../src/services/reviewPhotos"));
});

const BUYER = "buyer";
const OWNER = "owner";
const SHOP = "shop-1";

function image(id: string, mimeType = "image/jpeg") {
	return { id, mimeType, url: `/api/media/file/${id}.jpg`, alt: "x" };
}

const MEDIA = Array.from({ length: 7 }, (_, i) => image(`m${i}`));

function world(seed: Record<string, any[]> = {}) {
	return fakePayload({
		reviews: [],
		orders: [{ id: "order-1", buyer: BUYER, shop: SHOP, status: "delivered" }],
		shops: [{ id: SHOP, owner: OWNER, status: "active" }],
		users: [{ id: BUYER, name: "Grâce Ekane" }],
		media: [...MEDIA, image("pdf-1", "application/pdf")],
		"moderation-log": [],
		...seed,
	});
}

function createReview(
	payload: ReturnType<typeof world>,
	photos: unknown[],
	user: Record<string, unknown> = { id: BUYER },
) {
	return enforceReviewRules({
		operation: "create",
		data: { order: "order-1", rating: 5, photos },
		req: { user, payload },
	});
}

describe("review photo rule (contracts/reviewPhotos)", () => {
	it("is the media collection's own type and size rule", () => {
		expect([...REVIEW_PHOTO_MIME_TYPES]).toEqual([...ALLOWED_MEDIA_MIME_TYPES]);
		expect(REVIEW_PHOTO_MAX_BYTES).toBe(MAX_MEDIA_FILE_SIZE);
		expect(REVIEW_PHOTOS_MAX).toBe(5);
	});

	it("refuses non-images and oversized files", () => {
		expect(reviewPhotoIssue({ mimeType: "image/png", size: 1000 })).toBeNull();
		expect(reviewPhotoIssue({ mimeType: "video/mp4", size: 1000 })).toBe(
			"invalidType",
		);
		expect(reviewPhotoIssue({ mimeType: "image/svg+xml" })).toBe("invalidType");
		expect(
			reviewPhotoIssue({
				mimeType: "image/jpeg",
				size: REVIEW_PHOTO_MAX_BYTES + 1,
			}),
		).toBe("tooLarge");
	});

	it("stops at five and says why", () => {
		const file = { mimeType: "image/jpeg", size: 10 };
		const { photos, issue } = addReviewPhotos(
			[file, file, file, file],
			[file, file],
		);
		expect(photos).toHaveLength(5);
		expect(issue).toBe("tooMany");
	});
});

describe("enforceReviewRules: photos at creation", () => {
	it("keeps up to five distinct image uploads", async () => {
		const data = await createReview(world(), [
			"m0",
			"m1",
			{ id: "m2" },
			"m1",
			"m3",
			"m4",
		]);
		expect(data.photos).toEqual(["m0", "m1", "m2", "m3", "m4"]);
	});

	it("refuses a sixth photo with review.tooManyPhotos", async () => {
		await expect(
			createReview(
				world(),
				MEDIA.slice(0, 6).map((m) => m.id),
			),
		).rejects.toMatchObject({
			status: 400,
			data: { code: "review.tooManyPhotos" },
		});
	});

	it("refuses an upload that is not an image, or does not exist", async () => {
		await expect(createReview(world(), ["m0", "pdf-1"])).rejects.toMatchObject({
			status: 400,
			data: { code: "upload.invalidType" },
		});
		await expect(createReview(world(), ["missing"])).rejects.toMatchObject({
			status: 400,
			data: { code: "upload.invalidType" },
		});
	});

	it("reads ObjectId relations by their hex string", () => {
		const id = new ObjectId();
		expect(photoIds([id, id.toHexString(), null])).toEqual([id.toHexString()]);
	});
});

describe("enforceReviewRules: only the author adds photos, only at creation", () => {
	const original = { id: "r1", order: "order-1", photos: ["m0", "m1"] };

	it("drops any photo an update tries to add, whoever sends it", async () => {
		for (const user of [{ id: BUYER }, { id: "admin", role: "admin" }]) {
			const data = await enforceReviewRules({
				operation: "update",
				data: { photos: ["m0", "m1", "m5"] },
				originalDoc: original,
				req: { user, payload: world() },
			});
			expect(data.photos).toEqual(["m0", "m1"]);
		}
	});

	it("lets an update remove one", async () => {
		const data = await enforceReviewRules({
			operation: "update",
			data: { photos: ["m1"] },
			originalDoc: original,
			req: { user: { id: "admin", role: "admin" }, payload: world() },
		});
		expect(data.photos).toEqual(["m1"]);
	});
});

describe("public shop reviews: photos and the count", () => {
	function review(id: string, overrides: Record<string, unknown> = {}) {
		return {
			id,
			shop: SHOP,
			reviewer: BUYER,
			reviewedUser: OWNER,
			status: "published",
			verifiedPurchase: true,
			rating: 4,
			comment: null,
			createdAt: "2026-10-01T10:00:00.000Z",
			...overrides,
		};
	}

	it("shows a published review's photos and never a hidden one's", async () => {
		const payload = world({
			reviews: [
				review("shown", { photos: ["m0", "m1"] }),
				review("held", { status: "held_dispute", photos: ["m2"] }),
				review("removed", { status: "removed", photos: ["m3"] }),
				review("unverified", { verifiedPurchase: false, photos: ["m4"] }),
			],
		});

		const page = await publicShopReviews(payload, SHOP, 1);

		expect(page.reviews.map((r) => r.id)).toEqual(["shown"]);
		expect(page.reviews[0].photos).toEqual([
			{ id: "m0", url: "/api/media/file/m0.jpg" },
			{ id: "m1", url: "/api/media/file/m1.jpg" },
		]);
		expect(JSON.stringify(page)).not.toMatch(/m2|m3|m4/);
	});

	it("counts exactly what the list can page through", async () => {
		const payload = world({
			reviews: [
				review("a"),
				review("b"),
				review("c", { verifiedPurchase: false }),
				review("d", { status: "held_dispute" }),
			],
		});
		const page = await publicShopReviews(payload, SHOP, 1);
		expect(page.total).toBe(2);
		expect(page.total).toBe(page.reviews.length);
	});
});

describe("removeReviewPhoto (moderation)", () => {
	const moderator = { id: "mod-1", role: "moderator" };

	it("takes one photo off and logs it", async () => {
		const payload = world({
			reviews: [{ id: "r1", status: "published", photos: ["m0", "m1"] }],
		});
		const result = await removeReviewPhoto(payload, moderator, "r1", "m0");
		expect(result.photos).toEqual(["m1"]);
		expect(payload.store.reviews[0].photos).toEqual(["m1"]);
		expect(payload.store["moderation-log"]).toEqual([
			expect.objectContaining({
				action: "review.photo_remove",
				targetType: "review",
				targetId: "r1",
			}),
		]);
	});

	it("refuses a plain user, and a photo the review does not carry", async () => {
		const payload = world({
			reviews: [{ id: "r1", status: "published", photos: ["m0"] }],
		});
		await expect(
			removeReviewPhoto(payload, { id: BUYER, role: "user" }, "r1", "m0"),
		).rejects.toMatchObject({ status: 403 });
		await expect(
			removeReviewPhoto(payload, moderator, "r1", "m9"),
		).rejects.toMatchObject({ status: 404 });
	});
});
