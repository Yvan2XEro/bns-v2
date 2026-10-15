// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { recordStockCount } from "../../src/services/stock";
import {
	cancelStockCount,
	getStockCountOverview,
	saveStockCountProgress,
	startStockCount,
} from "../../src/services/stockCountSessions";
import { fakePayload } from "./helpers/fakePayload";

const U1 = { id: "u-1" };

function seed() {
	return fakePayload({
		users: [
			{ id: "u-1", name: "Aïcha M." },
			{ id: "u-2", name: "Stranger" },
		],
		shops: [
			{ id: "s-1", status: "active", owner: "u-1", level: 2 },
			{ id: "s-2", status: "active", owner: "u-2", level: 2 },
		],
		"shop-members": [
			{ id: "m-1", shop: "s-1", user: "u-1", role: "owner", status: "active" },
		],
		"shop-locations": [
			{ id: "loc-1", shop: "s-1", name: "Boutique Akwa", active: true },
			{ id: "loc-2", shop: "s-2", name: "Elsewhere", active: true },
		],
		products: [{ id: "p-1", shop: "s-1", title: "AirPods", status: "draft" }],
		"product-variants": [
			{
				id: "v-1",
				product: "p-1",
				shop: "s-1",
				optionValues: {},
				price: 95000,
				trackInventory: true,
				stockOnHand: 2,
				stockReserved: 0,
				archivedAt: null,
			},
		],
		"stock-movements": [],
		"stock-count-sessions": [],
	});
}

describe("stock count sessions", () => {
	it("starts one count, says who started it, and resumes it instead of opening a second", async () => {
		const payload = seed();
		const first = await startStockCount(payload, U1, "s-1", {
			locationId: "loc-1",
		});
		expect(first).toMatchObject({
			status: "open",
			startedBy: { id: "u-1", name: "Aïcha M." },
			location: { id: "loc-1", name: "Boutique Akwa" },
			counts: {},
		});
		const again = await startStockCount(payload, U1, "s-1", {});
		expect(again.id).toBe(first.id);
		expect(payload.store["stock-count-sessions"]).toHaveLength(1);
	});

	it("resumes the session a concurrent start just opened instead of opening a second", async () => {
		const payload = seed();
		const create = payload.create.bind(payload);
		const duplicateKey = () =>
			Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
		let raced = false;
		vi.spyOn(payload, "create").mockImplementation((async (args: {
			collection: string;
			data: Record<string, unknown>;
		}) => {
			if (args.collection === "stock-count-sessions" && !raced) {
				raced = true;
				await create({ ...args, req: undefined });
				throw duplicateKey();
			}
			return create(args);
		}) as typeof payload.create);

		const view = await startStockCount(payload, U1, "s-1", {});

		const sessions = payload.store["stock-count-sessions"];
		expect(sessions).toHaveLength(1);
		expect(view.id).toBe(String(sessions[0]?.id));
	});

	it("answers 409 when a concurrent start keeps winning", async () => {
		const payload = seed();
		vi.spyOn(payload, "create").mockRejectedValue(
			Object.assign(new Error("E11000 duplicate key"), { code: 11000 }),
		);

		await expect(startStockCount(payload, U1, "s-1", {})).rejects.toMatchObject(
			{ code: "stock.countInProgress", status: 409 },
		);
	});

	it("refuses another shop's location and a non-member", async () => {
		const payload = seed();
		await expect(
			startStockCount(payload, U1, "s-1", { locationId: "loc-2" }),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			startStockCount(payload, { id: "u-2" }, "s-1", {}),
		).rejects.toMatchObject({ code: "shop.notMember" });
	});

	it("keeps the typed counts on the server and returns them with the overview", async () => {
		const payload = seed();
		const session = await startStockCount(payload, U1, "s-1", {});
		await saveStockCountProgress(payload, U1, "s-1", session.id, {
			counts: { "v-1": " 3 ", "v-2": "" },
		});
		const overview = await getStockCountOverview(payload, U1, "s-1");
		expect(overview.session?.counts).toEqual({ "v-1": "3" });
		expect(overview.lastCompletedAt).toBeNull();
		expect(overview.locations).toEqual([
			{ id: "loc-1", name: "Boutique Akwa" },
		]);
	});

	it("closes the session in the same write as the corrections", async () => {
		const payload = seed();
		const session = await startStockCount(payload, U1, "s-1", {});
		await recordStockCount(payload, U1, "s-1", {
			counts: [{ variantId: "v-1", counted: 3 }],
			sessionId: session.id,
		});
		const stored = payload.store["stock-count-sessions"][0];
		expect(stored).toMatchObject({
			status: "completed",
			completedBy: "u-1",
			counts: { "v-1": "3" },
		});
		const overview = await getStockCountOverview(payload, U1, "s-1");
		expect(overview.session).toBeNull();
		expect(overview.lastCompletedAt).toBe(stored.completedAt);
		await expect(
			saveStockCountProgress(payload, U1, "s-1", session.id, { counts: {} }),
		).rejects.toMatchObject({ status: 409 });
	});

	it("refuses to close another shop's session with a count", async () => {
		const payload = seed();
		payload.store["stock-count-sessions"].push({
			id: "other",
			shop: "s-2",
			status: "open",
			startedAt: "2026-09-15T08:30:00.000Z",
		});
		await expect(
			recordStockCount(payload, U1, "s-1", {
				counts: [{ variantId: "v-1", counted: 3 }],
				sessionId: "other",
			}),
		).rejects.toMatchObject({ status: 404 });
	});

	it("cancels an open count", async () => {
		const payload = seed();
		const session = await startStockCount(payload, U1, "s-1", {});
		await cancelStockCount(payload, U1, "s-1", session.id);
		expect(payload.store["stock-count-sessions"][0].status).toBe("cancelled");
		expect(
			(await getStockCountOverview(payload, U1, "s-1")).session,
		).toBeNull();
	});
});
