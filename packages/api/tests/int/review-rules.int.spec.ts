// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { auditLegacyReviews } from "../../src/services/reviewAudit";
import {
	assertReviewAllowed,
	translateReviewWriteConflict,
} from "../../src/services/reviewRules";
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
let translateReviewWriteConflicts: (args: any) => Promise<any>;
beforeAll(async () => {
	({ enforceReviewRules, translateReviewWriteConflicts } = await import(
		"../../src/hooks/reviews"
	));
});

function world(seed: Record<string, any[]> = {}) {
	return fakePayload(
		{ reviews: [], conversations: [], "contact-reveals": [], ...seed },
		{ uniques: { reviews: [["reviewer", "reviewedUser"]] } },
	);
}

const allowed = (
	payload: ReturnType<typeof world>,
	reviewerId = "buyer",
	reviewedUserId = "seller",
) => assertReviewAllowed(payload, { reviewerId, reviewedUserId });

describe("assertReviewAllowed", () => {
	it("refuses a self-review", async () => {
		await expect(allowed(world(), "u-1", "u-1")).rejects.toMatchObject({
			code: "review.self",
			status: 400,
		});
	});

	it("refuses a second review of the same user", async () => {
		const payload = world({
			reviews: [{ id: "r-1", reviewer: "buyer", reviewedUser: "seller" }],
			conversations: [{ id: "c-1", participants: ["buyer", "seller"] }],
		});
		await expect(allowed(payload)).rejects.toMatchObject({
			code: "review.duplicate",
			status: 409,
		});
	});

	it("refuses a review without any interaction", async () => {
		await expect(allowed(world())).rejects.toMatchObject({
			code: "review.noInteraction",
			status: 403,
		});
	});

	it("accepts a review after a conversation with both users", async () => {
		const payload = world({
			conversations: [{ id: "c-1", participants: ["seller", "buyer"] }],
		});
		await expect(allowed(payload)).resolves.toBeUndefined();
	});

	it("accepts a review after the reviewer revealed the reviewed user's phone", async () => {
		const payload = world({
			"contact-reveals": [
				{ id: "cr-1", viewer: "buyer", seller: "seller", listing: "l-1" },
			],
		});
		await expect(allowed(payload)).resolves.toBeUndefined();
	});

	it("does not count the reverse reveal", async () => {
		const payload = world({
			"contact-reveals": [
				{ id: "cr-1", viewer: "seller", seller: "buyer", listing: "l-1" },
			],
		});
		await expect(allowed(payload)).rejects.toMatchObject({
			code: "review.noInteraction",
		});
	});

	it("still allows one personal review of the same user even after a shop review of them", async () => {
		// The three-field (reviewer, reviewedUser, shop) index this duplicate
		// check mirrors: a shop review of `seller`'s shop (shop set) and a
		// personal review of `seller` (shop null) are different rows, so an
		// existing shop review must never block the personal one.
		const payload = world({
			reviews: [
				{
					id: "r-1",
					reviewer: "buyer",
					reviewedUser: "seller",
					shop: "shop-1",
				},
			],
			conversations: [{ id: "c-1", participants: ["buyer", "seller"] }],
		});
		await expect(allowed(payload)).resolves.toBeUndefined();
	});
});

describe("enforceReviewRules hook", () => {
	const payload = world({
		conversations: [{ id: "c-1", participants: ["buyer", "seller"] }],
	});

	it("sets the reviewer from the signed-in user, ignoring the client's value", async () => {
		const data = await enforceReviewRules({
			operation: "create",
			data: { reviewer: "someone-else", reviewedUser: "seller", rating: 5 },
			req: { user: { id: "buyer" }, payload },
		});
		expect(data.reviewer).toBe("buyer");
	});

	it("turns a rule failure into an APIError carrying the code", async () => {
		await expect(
			enforceReviewRules({
				operation: "create",
				data: { reviewedUser: "buyer", rating: 5 },
				req: { user: { id: "buyer" }, payload },
			}),
		).rejects.toMatchObject({
			status: 400,
			data: { code: "review.self" },
			isPublic: true,
		});
	});

	it("leaves server-side writes and updates alone", async () => {
		const seeded = { reviewer: "a", reviewedUser: "a", rating: 4 };
		expect(
			await enforceReviewRules({
				operation: "create",
				data: seeded,
				req: { payload },
			}),
		).toEqual(seeded);
		expect(
			await enforceReviewRules({
				operation: "update",
				data: seeded,
				req: { user: { id: "b" }, payload },
			}),
		).toEqual(seeded);
	});
});

describe("translateReviewWriteConflict", () => {
	const reviewerId = "buyer";
	const reviewedUserId = "seller";

	it("leaves an error that is not a unique-index violation alone", async () => {
		const payload = world();
		const conflict = await translateReviewWriteConflict(
			payload,
			{ reviewerId, reviewedUserId },
			new Error("connection reset"),
		);
		expect(conflict).toBeUndefined();
	});

	it("leaves a duplicate-key-shaped error alone when the pair does not actually exist", async () => {
		const payload = world();
		const conflict = await translateReviewWriteConflict(
			payload,
			{ reviewerId, reviewedUserId },
			Object.assign(new Error("E11000"), { code: 11000 }),
		);
		expect(conflict).toBeUndefined();
	});

	it("translates a confirmed duplicate-key error into review.duplicate", async () => {
		const payload = world({
			reviews: [
				{ id: "r-1", reviewer: reviewerId, reviewedUser: reviewedUserId },
			],
		});
		const conflict = await translateReviewWriteConflict(
			payload,
			{ reviewerId, reviewedUserId },
			Object.assign(new Error("E11000"), { code: 11000 }),
		);
		expect(conflict).toMatchObject({ code: "review.duplicate", status: 409 });
	});

	it("recognises the ValidationError shape Payload's mongodb adapter wraps E11000 in", async () => {
		const payload = world({
			reviews: [
				{ id: "r-1", reviewer: reviewerId, reviewedUser: reviewedUserId },
			],
		});
		const wrapped = Object.assign(new Error("Value must be unique"), {
			name: "ValidationError",
			data: {
				collection: "reviews",
				errors: [{ message: "Value must be unique", path: "reviewer" }],
			},
		});
		const conflict = await translateReviewWriteConflict(
			payload,
			{ reviewerId, reviewedUserId },
			wrapped,
		);
		expect(conflict).toMatchObject({ code: "review.duplicate", status: 409 });
	});
});

describe("two creates racing past the pre-check", () => {
	// Mirrors the full request flow: enforceReviewRules validates and stamps
	// the reviewer, then the collection's own create runs, guarded by the
	// unique index declared on the fake; translateReviewWriteConflict is what
	// production's afterError hook uses to translate the loser's raw
	// duplicate-key error into the same review.duplicate the pre-check throws.
	async function submitReview(
		payload: ReturnType<typeof world>,
		reviewerId: string,
		reviewedUserId: string,
	) {
		const req = { user: { id: reviewerId }, payload };
		const data = await enforceReviewRules({
			operation: "create",
			data: { reviewedUser: reviewedUserId, rating: 5 },
			req,
		});
		try {
			return await payload.create({ collection: "reviews", data });
		} catch (error) {
			const conflict = await translateReviewWriteConflict(
				payload,
				{ reviewerId, reviewedUserId },
				error,
			);
			throw conflict ?? error;
		}
	}

	it("settles one winner and turns the loser's duplicate-key error into review.duplicate", async () => {
		const payload = world({
			conversations: [{ id: "c-1", participants: ["buyer", "seller"] }],
		});

		const results = await Promise.allSettled([
			submitReview(payload, "buyer", "seller"),
			submitReview(payload, "buyer", "seller"),
		]);

		expect(results.map((result) => result.status)).toEqual([
			"fulfilled",
			"rejected",
		]);
		const rejected = results.find((result) => result.status === "rejected");
		expect(rejected).toMatchObject({
			reason: { code: "review.duplicate", status: 409 },
		});
		expect(payload.store.reviews).toHaveLength(1);
	});
});

describe("translateReviewWriteConflicts hook", () => {
	it("rewrites the response for a confirmed duplicate", async () => {
		const payload = world({
			reviews: [{ id: "r-1", reviewer: "buyer", reviewedUser: "seller" }],
		});
		const result = await translateReviewWriteConflicts({
			error: Object.assign(new Error("E11000"), { code: 11000 }),
			req: { user: { id: "buyer" }, payload, data: { reviewedUser: "seller" } },
		});
		expect(result).toMatchObject({
			status: 409,
			response: { errors: [{ data: { code: "review.duplicate" } }] },
		});
	});

	it("leaves the response alone without a signed-in user", async () => {
		const payload = world();
		const result = await translateReviewWriteConflicts({
			error: Object.assign(new Error("E11000"), { code: 11000 }),
			req: { payload, data: { reviewedUser: "seller" } },
		});
		expect(result).toBeUndefined();
	});
});

describe("auditLegacyReviews", () => {
	it("lists self-reviews and duplicate groups without deleting anything", async () => {
		const payload = world({
			reviews: [
				{ id: "r-1", reviewer: "a", reviewedUser: "b" },
				{ id: "r-2", reviewer: "a", reviewedUser: "b" },
				{ id: "r-3", reviewer: "c", reviewedUser: "c" },
				{ id: "r-4", reviewer: "a", reviewedUser: "d" },
			],
		});
		const audit = await auditLegacyReviews(payload);

		expect(audit.selfReviewIds).toEqual(["r-3"]);
		expect(audit.duplicateGroups).toEqual([
			{ reviewer: "a", reviewedUser: "b", reviewIds: ["r-1", "r-2"] },
		]);
		expect(payload.store.reviews).toHaveLength(4);
	});
});
