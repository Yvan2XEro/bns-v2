// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/validation", () => ({
	validateListingAttributes: vi.fn(async () => []),
}));

import { Listings } from "../../src/collections/Listings";
import { issuesFromErrorBody } from "../../src/contracts/formIssues";
import {
	canAddPhoto,
	normalizePhotoLimit,
	photoLimitIssue,
	photosRemaining,
} from "../../src/contracts/photoLimit";
import { createProduct, updateProduct } from "../../src/services/products";
import { attachListings } from "../../src/services/shopListings";
import { fakePayload } from "./helpers/fakePayload";

const U1 = { id: "u-1" };
const ids = (n: number, from = 0) =>
	Array.from({ length: n }, (_, i) => `m-${i + from}`);

function seed(photosIncluded?: number) {
	return fakePayload(
		{
			users: [{ id: "u-1", name: "Aïcha" }],
			categories: [{ id: "cat-1", name: "Téléphones" }],
			shops: [
				{
					id: "s-1",
					status: "active",
					owner: "u-1",
					level: 2,
					location: { city: "Douala" },
				},
			],
			"shop-members": [
				{
					id: "m-1",
					shop: "s-1",
					user: "u-1",
					role: "owner",
					status: "active",
				},
			],
			listings: [
				{
					id: "l-legacy",
					title: "iPhone 12",
					price: 195000,
					category: "cat-1",
					attributes: {},
					images: ids(6).map((image) => ({ image })),
					status: "published",
					seller: "u-1",
					shop: null,
					product: null,
					location: "Douala",
				},
			],
			products: [],
			"product-variants": [],
			"stock-movements": [],
		},
		{
			uniques: { products: [["listing"]] },
			globals:
				photosIncluded === undefined
					? {}
					: { "app-settings": { media: { photosIncluded } } },
		},
	);
}

const product = (images: string[], variants?: unknown[]) => ({
	title: "Samsung Galaxy S24",
	category: "cat-1",
	images,
	status: "draft",
	options: [],
	variants: variants ?? [{ optionValues: {}, price: 1000 }],
});

const setLimit = (payload: ReturnType<typeof seed>, photosIncluded: number) => {
	payload.globals["app-settings"] = { media: { photosIncluded } };
};

describe("the shared photo rule", () => {
	it("refuses a count past the limit on a create", () => {
		expect(photoLimitIssue(3, null, 3)).toBeNull();
		expect(photoLimitIssue(4, null, 3)).toEqual({
			path: "images",
			rule: "photoLimit",
			params: { max: 3 },
		});
	});

	it("lets an edit keep or shrink a count above the limit, never grow it", () => {
		expect(photoLimitIssue(6, 6, 3)).toBeNull();
		expect(photoLimitIssue(5, 6, 3)).toBeNull();
		expect(photoLimitIssue(7, 6, 3)).toMatchObject({ rule: "photoLimit" });
		expect(photoLimitIssue(4, 3, 3)).toMatchObject({ rule: "photoLimit" });
	});

	it("reads an unset or broken setting as 3 and never goes past the ceiling", () => {
		expect(normalizePhotoLimit(undefined)).toBe(3);
		expect(normalizePhotoLimit("x")).toBe(3);
		expect(normalizePhotoLimit(0)).toBe(1);
		expect(normalizePhotoLimit(25)).toBe(10);
		expect(canAddPhoto(2, 3)).toBe(true);
		expect(canAddPhoto(3, 3)).toBe(false);
		expect(photosRemaining(6, 3)).toBe(0);
		expect(photosRemaining(1, 5)).toBe(4);
	});
});

describe("shop products", () => {
	it("refuses a fourth photo on a create by default, on `images`, with the limit", async () => {
		await expect(
			createProduct(seed(), U1, "s-1", product(ids(4))),
		).rejects.toMatchObject({
			code: "media.photoLimit",
			status: 400,
			details: {
				limit: 3,
				issues: [{ path: "images", rule: "photoLimit", params: { max: 3 } }],
			},
		});
		const { product: created } = await createProduct(
			seed(),
			U1,
			"s-1",
			product(ids(3)),
		);
		expect(created.images).toHaveLength(3);
	});

	it("follows the admin setting as soon as it changes", async () => {
		const payload = seed(5);
		const { product: created } = await createProduct(
			payload,
			U1,
			"s-1",
			product(ids(5)),
		);
		expect(created.images).toHaveLength(5);
		setLimit(payload, 2);
		await expect(
			createProduct(payload, U1, "s-1", product(ids(3))),
		).rejects.toMatchObject({
			code: "media.photoLimit",
			details: { limit: 2 },
		});
	});

	it("keeps a product saved above the limit editable: same or fewer photos, not more", async () => {
		const payload = seed(10);
		const { product: created, variants } = await createProduct(
			payload,
			U1,
			"s-1",
			product(ids(6)),
		);
		setLimit(payload, 3);
		const rows = variants.map((v) => ({
			id: v.id,
			optionValues: v.optionValues,
			price: v.price,
		}));

		const kept = await updateProduct(
			payload,
			U1,
			created.id,
			product(ids(6), rows),
		);
		expect(kept.product.images).toHaveLength(6);

		const fewer = await updateProduct(
			payload,
			U1,
			created.id,
			product(ids(5), rows),
		);
		expect(fewer.product.images).toHaveLength(5);

		await expect(
			updateProduct(payload, U1, created.id, product(ids(6), rows)),
		).rejects.toMatchObject({
			code: "media.photoLimit",
			details: { issues: [{ path: "images" }] },
		});
	});

	it("moves a classified listing with more photos than the limit into the shop untouched", async () => {
		const payload = seed();
		const result = await attachListings(payload, U1, "s-1", {
			listingIds: ["l-legacy"],
		});
		expect(result.attached).toHaveLength(1);
		const moved = payload.store.products.find(
			(p) => p.id === result.attached[0].productId,
		) as { images: unknown[] };
		expect(moved.images).toHaveLength(6);
	});
});

describe("classified listings", () => {
	const beforeChange = Listings.hooks?.beforeChange?.[0] as (
		args: unknown,
	) => Promise<Record<string, unknown>>;
	const images = (n: number) => ids(n).map((image) => ({ image }));
	const write = (
		payload: ReturnType<typeof seed>,
		count: number,
		previous?: number,
	) =>
		beforeChange({
			operation: previous === undefined ? "create" : "update",
			data: {
				title: "iPhone",
				description: "desc",
				category: "cat-1",
				location: "Douala",
				price: 10,
				images: images(count),
			},
			originalDoc:
				previous === undefined
					? undefined
					: { category: "cat-1", images: images(previous) },
			req: { payload, user: { id: "u-1" }, context: {} },
		});

	it("refuses a create past the limit with a ValidationError on `images` that names the code", async () => {
		const refusal = await write(seed(), 4).catch((error) => error);
		expect(refusal).toMatchObject({
			status: 400,
			data: {
				code: "media.photoLimit",
				limit: 3,
				errors: [{ path: "images", rule: "photoLimit", params: { max: 3 } }],
			},
		});
		expect(
			issuesFromErrorBody({ errors: [{ data: refusal.data }] }),
		).toMatchObject([
			{ path: "images", rule: "photoLimit", params: { max: 3 } },
		]);
		await expect(write(seed(), 3)).resolves.toBeTruthy();
	});

	it("follows the admin setting", async () => {
		await expect(write(seed(5), 5)).resolves.toBeTruthy();
		await expect(write(seed(2), 3)).rejects.toMatchObject({
			data: { limit: 2 },
		});
	});

	it("lets a legacy listing keep or lose photos but not gain one", async () => {
		const payload = seed();
		await expect(write(payload, 6, 6)).resolves.toBeTruthy();
		await expect(write(payload, 4, 6)).resolves.toBeTruthy();
		await expect(write(payload, 7, 6)).rejects.toMatchObject({
			data: { code: "media.photoLimit" },
		});
	});
});
