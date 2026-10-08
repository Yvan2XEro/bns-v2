// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AppSettings } from "../../src/globals/AppSettings";
import { getResaleSettings } from "../../src/lib/resaleSettings";
import { fakePayload } from "./helpers/fakePayload";

describe("getResaleSettings", () => {
	it("fails closed when app settings cannot be read", async () => {
		const payload = fakePayload();
		payload.failWhen = (method) => method === "findGlobal";

		expect(await getResaleSettings(payload)).toEqual({
			enabled: false,
			prepaidEnabled: false,
			poAcceptHours: 24,
			newResellerWeeklyCap: 25_000,
			minPayout: 2_000,
			payoutApprovalAbove: 500_000,
		});
	});

	it("keeps resale and prepaid closed by default", async () => {
		expect(await getResaleSettings(fakePayload())).toEqual({
			enabled: false,
			prepaidEnabled: false,
			poAcceptHours: 24,
			newResellerWeeklyCap: 25_000,
			minPayout: 2_000,
			payoutApprovalAbove: 500_000,
		});
	});

	it("requires the P5 switch and written NotchPay gate evidence for prepaid", async () => {
		const resale = {
			enabled: true,
			prepaidEnabled: true,
			gates: [
				{
					gate: "notchpay_affiliate",
					clearedAt: "2026-10-01T00:00:00.000Z",
					clearedBy: "admin-1",
					evidence: { id: "evidence-1" },
				},
			],
		};
		const closedPayload = fakePayload(
			{},
			{
				globals: {
					"app-settings": {
						resale,
						payments: { protectedPayment: { enabled: false } },
					},
				},
			},
		);
		expect((await getResaleSettings(closedPayload)).prepaidEnabled).toBe(false);
		const openPayload = fakePayload(
			{},
			{
				globals: {
					"app-settings": {
						resale,
						payments: { protectedPayment: { enabled: true } },
					},
				},
			},
		);
		expect((await getResaleSettings(openPayload)).prepaidEnabled).toBe(true);
	});

	it("does not accept a gate row without evidence", async () => {
		const payload = fakePayload(
			{},
			{
				globals: {
					"app-settings": {
						resale: {
							enabled: true,
							prepaidEnabled: true,
							gates: [{ gate: "notchpay_affiliate" }],
						},
						payments: { protectedPayment: { enabled: true } },
					},
				},
			},
		);

		expect((await getResaleSettings(payload)).prepaidEnabled).toBe(false);
	});
});

describe("AppSettings resale prepaid gate", () => {
	const hook = AppSettings.hooks?.beforeChange?.at(-1) as unknown as (args: {
		data: Record<string, unknown>;
		originalDoc?: Record<string, unknown>;
	}) => unknown;

	it("refuses prepaid without P5 or affiliate evidence", () => {
		expect(() =>
			hook({
				data: {
					resale: { prepaidEnabled: true, gates: [] },
					payments: { protectedPayment: { enabled: false } },
				},
			}),
		).toThrow("requires payments.protectedPayment.enabled");
		expect(() =>
			hook({
				data: {
					resale: { prepaidEnabled: true, gates: [] },
					payments: { protectedPayment: { enabled: true } },
				},
			}),
		).toThrow("requires a filed notchpay_affiliate gate with evidence");
	});

	it("allows prepaid after both prerequisites are stored", () => {
		const result = hook({
			data: {
				resale: {
					prepaidEnabled: true,
					gates: [{ gate: "notchpay_affiliate", evidence: "evidence-1" }],
				},
				payments: { protectedPayment: { enabled: true } },
			},
		});
		expect(result).toMatchObject({ resale: { prepaidEnabled: true } });
	});
});
