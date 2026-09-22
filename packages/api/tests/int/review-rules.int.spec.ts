// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { auditLegacyReviews } from "../../src/services/reviewAudit";
import { assertReviewAllowed } from "../../src/services/reviewRules";
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
beforeAll(async () => {
	({ enforceReviewRules } = await import("../../src/hooks/reviews"));
});

function world(seed: Record<string, any[]> = {}) {
	return fakePayload({
		reviews: [],
		conversations: [],
		"contact-reveals": [],
		...seed,
	});
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
