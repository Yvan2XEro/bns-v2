// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	DEFAULT_MARKETS,
	getPaymentSettings,
	resolveSettlement,
} from "../../src/lib/paymentSettings";
import { seedMarkets } from "../../src/seed/seedMarkets";
import { withRawMongo } from "./helpers/fakeMongo";
import { fakePayload } from "./helpers/fakePayload";

const CM = DEFAULT_MARKETS[0];

/** A migrated world: the CM row seeded from the literals, then the global. */
async function migrated(payments: Record<string, unknown> = {}) {
	const api = withRawMongo(
		fakePayload(
			{ "market-cities": [] },
			{ globals: { "app-settings": { payments } } },
		),
	);
	await seedMarkets(api);
	const { docs } = await api.find({ collection: "markets", limit: 0 });
	return { api, id: docs[0].id as string };
}

describe("getPaymentSettings.markets hydrates from the registry", () => {
	it("reads the migrated CM row as the P5 shape, whole object", async () => {
		const { api } = await migrated();
		expect((await getPaymentSettings(api)).markets).toEqual([CM]);
	});

	it("prefers the market row over the global's legacy rows", async () => {
		const { api, id } = await migrated({
			markets: [{ ...CM, vatRateBps: 1000 }],
		});
		await api.update({
			collection: "markets",
			id,
			data: {
				vatRateBps: 1800,
				payments: {
					provider: "notchpay",
					settlementMode: "provider_split",
					channels: ["cm.mtn", "cm.wave"],
					enabled: true,
				},
			},
		});
		const { markets } = await getPaymentSettings(api);
		expect(markets).toEqual([
			{
				...CM,
				vatRateBps: 1800,
				channels: ["cm.mtn", "cm.wave"],
				enabled: true,
			},
		]);
		expect(
			resolveSettlement(await getPaymentSettings(api), "CM").vatRateBps,
		).toBe(1800);
	});

	it("leaves a draft market out", async () => {
		const { api, id } = await migrated();
		await api.update({ collection: "markets", id, data: { status: "draft" } });
		expect((await getPaymentSettings(api)).markets).toEqual([]);
	});

	it("keeps a market in review", async () => {
		const { api, id } = await migrated();
		await api.update({ collection: "markets", id, data: { status: "review" } });
		expect((await getPaymentSettings(api)).markets).toEqual([CM]);
	});

	it("serves no market when every stored row is untrustworthy, never the legacy ones", async () => {
		const { api, id } = await migrated({ markets: [CM] });
		await api.update({
			collection: "markets",
			id,
			data: { timezone: "Not/AZone" },
		});
		expect((await getPaymentSettings(api)).markets).toEqual([]);
	});

	it("fails closed when the market collection cannot be read", async () => {
		const { api } = await migrated({ markets: [CM] });
		api.failWhen = (method, args) =>
			method === "find" && args.collection === "markets";
		const settings = await getPaymentSettings(api);
		expect(settings.markets).toEqual([]);
		expect(settings.protectedPayment.enabled).toBe(false);
	});

	it("falls back to the global's rows only while the registry holds none (pre-migration)", async () => {
		const api = fakePayload(
			{},
			{
				globals: {
					"app-settings": {
						payments: { markets: [{ ...CM, vatRateBps: 1800 }] },
					},
				},
			},
		);
		expect((await getPaymentSettings(api)).markets).toEqual([
			{ ...CM, vatRateBps: 1800 },
		]);
	});
});
