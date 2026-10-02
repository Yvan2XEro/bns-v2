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
