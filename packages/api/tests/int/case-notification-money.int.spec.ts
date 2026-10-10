// @vitest-environment node
import type { PayloadRequest } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatMoney } from "../../src/contracts/money";
import type { ReturnCase } from "../../src/payload-types";

const { triggerNotificationEvent } = vi.hoisted(() => ({
	triggerNotificationEvent: vi.fn(async () => undefined),
}));
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent,
}));
vi.mock("../../src/services/notificationProvider", () => ({
	isNotificationProviderConfigured: () => true,
}));

import { notifyReturnInspected } from "../../src/services/caseNotifications";
import { cmMarketRow, fakePayload } from "./helpers/fakePayload";
import { cmRow, served } from "./helpers/servedMarket";

const kase = {
	id: "rc-1",
	number: "RET-1",
	buyer: "buyer-1",
	order: "order-1",
	items: [{ inspection: { deductionAmount: 1_500 } }],
} as unknown as ReturnCase;

const order = (over: Record<string, unknown>) => ({
	id: "order-1",
	amounts: { currency: "XAF" },
	...over,
});

async function bodyFor(orders: Record<string, unknown>[], markets: object[]) {
	const payload = fakePayload({ orders, markets });
	await notifyReturnInspected({ payload } as unknown as PayloadRequest, kase);
	const call = triggerNotificationEvent.mock.calls[0] as unknown as [
		{ payload: { message: string } },
	];
	return call[0].payload.message;
}

describe("notifyReturnInspected money", () => {
	beforeEach(() => triggerNotificationEvent.mockClear());

	it("formats the deduction with the order's market rows", async () => {
		const formats = served(cmRow()).formats;
		const fr = formats.find((f) => f.locale === "fr");
		const en = formats.find((f) => f.locale === "en");
		if (!fr || !en) throw new Error("served CM row lacks a format");
		expect(await bodyFor([order({ market: "m-cm" })], [cmMarketRow()])).toBe(
			`Déduction proposée : ${formatMoney(1_500, fr)}. / Proposed deduction: ${formatMoney(1_500, en)}.`,
		);
	});

	it("with no resolvable market prints the amount and the order's own currency word", async () => {
		expect(await bodyFor([order({ amounts: { currency: "EUR" } })], [])).toBe(
			"Déduction proposée : 1500 EUR. / Proposed deduction: 1500 EUR.",
		);
	});
});
