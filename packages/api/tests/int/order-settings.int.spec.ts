// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	deliveryFeeFor,
	getOrderSettings,
	isPilotShop,
} from "../../src/lib/orderSettings";
import { fakePayload } from "./helpers/fakePayload";

const settingsGlobal = (orders: Record<string, unknown>) =>
	fakePayload({}, { globals: { "app-settings": { orders } } });

describe("getOrderSettings", () => {
	it("fails closed when the global cannot be read", async () => {
		const payload = fakePayload();
		payload.failWhen = (method) => method === "findGlobal";
		const settings = await getOrderSettings(payload);
		expect(settings.enabled).toBe(false);
	});

	it("fails closed when the group is absent", async () => {
		expect((await getOrderSettings(fakePayload())).enabled).toBe(false);
	});

	it("reads the flag, the cities and every default", async () => {
		const payload = settingsGlobal({ enabled: true });
		const settings = await getOrderSettings(payload);
		expect(settings.enabled).toBe(true);
		expect(settings.defaultCommissionRateBps).toBe(800);
		expect(settings.vatRateBps).toBe(1925);
		expect(settings.minInvoiceAmount).toBe(500);
		expect(settings.invoiceDueDays).toBe(7);
		expect(settings.restrictAfterOverdueDays).toBe(3);
		expect(settings.confirmHours).toBe(24);
		expect(settings.acceptHours).toBe(48);
		expect(settings.withdrawalDays).toBe(15);
		expect(settings.staleShippedDays).toBe(14);
		expect(settings.termsVersion).toBe("2026-09");
		expect(settings.launchCities.map((c) => c.key)).toEqual([
			"douala",
			"yaounde",
		]);
	});

	it("takes a per-city fee override and ignores an unknown city", async () => {
		const payload = settingsGlobal({
			enabled: true,
			launchCities: [
				{ key: "douala", deliveryFee: 2500 },
				{ key: "kribi", deliveryFee: 1000 },
			],
		});
		const settings = await getOrderSettings(payload);
		expect(deliveryFeeFor(settings, "douala")).toBe(2500);
		expect(settings.launchCities.map((c) => c.key)).toEqual(["douala"]);
	});

	it("answers null for a city the settings do not enable", async () => {
		const payload = settingsGlobal({
			enabled: true,
			launchCities: [{ key: "douala" }],
		});
		expect(
			deliveryFeeFor(await getOrderSettings(payload), "yaounde"),
		).toBeNull();
	});

	// The global has carried these two JSON fields since the settings task,
	// with descriptions promising a merge that never existed: an admin
	// tightening a cap turned a knob connected to nothing, and checkout kept
	// enforcing the built-in defaults.
	it("merges a shop cap override onto the level defaults and drops garbage", async () => {
		const settings = await getOrderSettings(
			settingsGlobal({
				enabled: true,
				shopCaps: {
					1: { maxDailyOrders: 5, maxOrderTotal: "nonsense" },
					2: "not a row",
					9: { maxDailyOrders: 1 },
				},
			}),
		);
		// Only the sane override of a known level survives, partially.
		expect(settings.shopCaps).toEqual({ 1: { maxDailyOrders: 5 } });
	});

	it("merges a buyer tier override row-wise onto BUYER_CAPS", async () => {
		const settings = await getOrderSettings(
			settingsGlobal({
				enabled: true,
				buyerCaps: {
					new: { maxOpenOrders: 2, confirmation: "call" },
					trusted: { maxOrderTotal: null },
					watch: { confirmation: "shout" },
					ghost: { maxOpenOrders: 9 },
				},
			}),
		);
		// The named fields move; everything else keeps its default.
		expect(settings.buyerCaps.new).toEqual({
			maxOpenOrders: 2,
			maxOrderTotal: 75_000,
			confirmation: "call",
		});
		// null is a legal value here: "the shop cap alone decides".
		expect(settings.buyerCaps.trusted.maxOrderTotal).toBeNull();
		// An unknown confirmation and an unknown tier change nothing.
		expect(settings.buyerCaps.watch.confirmation).toBe("call");
		expect(Object.keys(settings.buyerCaps).sort()).toEqual([
			"blocked",
			"new",
			"regular",
			"trusted",
			"watch",
		]);
	});

	it("restricts COD to the pilot shops when the list is non-empty", async () => {
		const open = await getOrderSettings(settingsGlobal({ enabled: true }));
		expect(isPilotShop(open, "s-1")).toBe(true);
		const piloted = await getOrderSettings(
			settingsGlobal({ enabled: true, pilotShopIds: ["s-2"] }),
		);
		expect(isPilotShop(piloted, "s-1")).toBe(false);
		expect(isPilotShop(piloted, "s-2")).toBe(true);
	});
});
