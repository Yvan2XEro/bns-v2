// @vitest-environment node
import { describe, expect, it, type Mock } from "vitest";
import {
	formatSequence,
	monthKeyFor,
	nextInvoiceNumber,
	nextNumber,
	sequenceMarketOfOrder,
} from "../../src/services/sequences";
import { fakePayload } from "./helpers/fakePayload";

const at = (iso: string) => new Date(iso);

describe("monthKeyFor", () => {
	it("takes the month in Africa/Douala, not UTC", () => {
		// 23:30 UTC on 30 September is 00:30 on 1 October in Douala (UTC+1).
		expect(monthKeyFor(at("2026-09-30T23:30:00.000Z"))).toBe("2610");
		expect(monthKeyFor(at("2026-09-30T22:30:00.000Z"))).toBe("2609");
	});
});

describe("formatSequence", () => {
	it("zero-pads to the width", () => {
		expect(formatSequence("BNS", "2609", 123, 6)).toBe("BNS-2609-000123");
		expect(formatSequence("PO", "2609", 404, 4)).toBe("PO-2609-0404");
	});

	it("widens by one digit past the width's maximum instead of truncating", () => {
		expect(formatSequence("BNS", "2609", 1_000_000, 6)).toBe(
			"BNS-2609-1000000",
		);
	});
});

describe("nextNumber", () => {
	it("starts at 1 and increments per month key", async () => {
		const payload = fakePayload(
			{ sequences: [] },
			{ uniques: { sequences: [["key"]] } },
		);
		expect(
			await nextNumber(payload, "BNS", at("2026-09-15T10:00:00.000Z")),
		).toBe("BNS-2609-000001");
		expect(
			await nextNumber(payload, "BNS", at("2026-09-16T10:00:00.000Z")),
		).toBe("BNS-2609-000002");
		expect(
			await nextNumber(payload, "BNS", at("2026-10-01T10:00:00.000Z")),
		).toBe("BNS-2610-000001");
		expect(
			await nextNumber(payload, "RET", at("2026-09-16T10:00:00.000Z")),
		).toBe("RET-2609-000001");
	});

	it("gives twenty concurrent callers twenty distinct numbers", async () => {
		const payload = fakePayload(
			{ sequences: [] },
			{ uniques: { sequences: [["key"]] } },
		);
		const results = await Promise.all(
			Array.from({ length: 20 }, () =>
				nextNumber(payload, "BNS", at("2026-09-15T10:00:00.000Z")),
			),
		);
		expect(new Set(results).size).toBe(20);
	});

	it("never joins the caller's transaction, so an aborted order burns its number", async () => {
		const payload = fakePayload(
			{ sequences: [] },
			{ uniques: { sequences: [["key"]] } },
		);
		await nextNumber(payload, "BNS", at("2026-09-15T10:00:00.000Z"));
		expect(payload.writes.every((w) => w.transactionID === undefined)).toBe(
			true,
		);
	});
});

describe("nextInvoiceNumber", () => {
	it("numbers yearly, inside the caller's transaction, so a rollback releases it", async () => {
		const payload = fakePayload(
			{ sequences: [] },
			{ uniques: { sequences: [["key"]] } },
		);
		const req = { payload, transactionID: "tx-1", context: {} } as never;
		expect(
			await nextInvoiceNumber(req, "C", at("2026-10-05T08:00:00.000Z")),
		).toBe("BNS-C-2026-000001");
		expect(
			await nextInvoiceNumber(req, "C", at("2026-10-12T08:00:00.000Z")),
		).toBe("BNS-C-2026-000002");
		expect(
			await nextInvoiceNumber(req, "F", at("2026-10-12T08:00:00.000Z")),
		).toBe("BNS-F-2026-000001");
		expect(payload.writes.at(-1)?.transactionID).toBe("tx-1");
	});
});

describe("sequenceMarketOfOrder legacy fallback", () => {
	it("warns when an order carrying a market stamp resolves to nothing, and stays silent for a pre-market order", async () => {
		const api = fakePayload({ markets: [] });
		const warn = api.logger.warn as Mock;
		const amounts = {
			subtotal: 1,
			deliveryFee: 0,
			total: 1,
			currency: "ZZZ",
		};
		const legacy = await sequenceMarketOfOrder(api, { amounts });
		expect(legacy.countryCode).toBe("CM");
		expect(warn).not.toHaveBeenCalled();

		const dangling = await sequenceMarketOfOrder(api, {
			market: "market-gone",
			amounts,
		});
		expect(dangling.countryCode).toBe("CM");
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0][0])).toContain("market-gone");
	});
});
