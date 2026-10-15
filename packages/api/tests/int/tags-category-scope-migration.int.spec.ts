// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	goodsCover,
	loadCategoryRows,
	migrateTagCategoryScope,
} from "../../src/migrations/tagsCategoryScope";
import { withRawMongo } from "./helpers/fakeMongo";
import { fakePayload } from "./helpers/fakePayload";

const categories = [
	{ id: "veh", slug: "vehicles", listingForm: { type: "product" } },
	{ id: "cars", slug: "cars", parent: "veh" },
	{ id: "lei", slug: "leisure-sports", listingForm: { type: "product" } },
	{ id: "spo", slug: "sports-equipment", parent: "lei" },
	{
		id: "tra",
		slug: "travel-vacation",
		parent: "lei",
		listingForm: { type: "rental" },
	},
	{ id: "jbs", slug: "jobs-services", listingForm: { type: "service" } },
	{
		id: "job",
		slug: "job-offers",
		parent: "jbs",
		listingForm: { type: "job" },
	},
];

const seed = () =>
	withRawMongo(
		fakePayload({
			categories,
			tags: [
				{ id: "t-delivery", slug: "delivery", name: "Livraison" },
				{ id: "t-fulltime", slug: "full-time", name: "Temps plein" },
				{ id: "t-promo", slug: "promo", name: "Promo" },
				{
					id: "t-admin",
					slug: "admin-made",
					name: "Admin",
					categories: ["tra"],
				},
			],
			listings: [
				{ id: "l-car", category: "cars", tags: ["t-promo", "t-fulltime"] },
				{ id: "l-job", category: "job", tags: ["t-fulltime"] },
				{
					id: "l-holiday",
					category: "tra",
					tags: ["t-delivery", "t-promo", "t-admin"],
				},
				{ id: "l-bare", category: "cars" },
			],
		}),
	);

describe("tags category scope migration", () => {
	it("covers goods with the highest all-goods categories", async () => {
		const payload = seed();
		const cover = goodsCover(await loadCategoryRows(payload));
		// Leisure holds holiday rentals, so it is replaced by its goods child.
		expect(cover.sort()).toEqual(["spo", "veh"]);
	});

	it("scopes seeded tags by slug, others to goods, and keeps an admin's scope", async () => {
		const payload = seed();
		await migrateTagCategoryScope(payload);
		const scope = (id: string) =>
			payload.store.tags.find((tag) => tag.id === id)?.categories;
		expect(scope("t-delivery")).toEqual(["spo"]);
		expect(scope("t-fulltime")).toEqual(["job"]);
		expect(scope("t-promo")).toEqual(["veh", "spo"]);
		expect(scope("t-admin")).toEqual(["tra"]);
	});

	it("drops from each listing the tags its category no longer gets", async () => {
		const payload = seed();
		const report = await migrateTagCategoryScope(payload);
		const tagsOf = (id: string) =>
			payload.store.listings.find((listing) => listing.id === id)?.tags;
		expect(tagsOf("l-car")).toEqual(["t-promo"]);
		expect(tagsOf("l-job")).toEqual(["t-fulltime"]);
		expect(tagsOf("l-holiday")).toEqual(["t-admin"]);
		expect(tagsOf("l-bare")).toBeUndefined();
		expect(report).toEqual({
			tagsScoped: 3,
			tagsAlreadyScoped: 1,
			listingsChanged: 2,
			tagsDropped: 3,
		});
	});

	it("changes nothing on a second run", async () => {
		const payload = seed();
		await migrateTagCategoryScope(payload);
		const before = structuredClone(payload.store);
		const again = await migrateTagCategoryScope(payload);
		expect(again).toEqual({
			tagsScoped: 0,
			tagsAlreadyScoped: 4,
			listingsChanged: 0,
			tagsDropped: 0,
		});
		expect(payload.store.tags).toEqual(before.tags);
		expect(payload.store.listings).toEqual(before.listings);
	});
});
