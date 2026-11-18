// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../../src/lib/errors";
import {
	collusionMatch,
	FakeResaleAdjuster,
	getResaleAdjuster,
	registerResaleAdjuster,
	resaleParties,
} from "../../src/lib/resale";
import { withTransaction } from "../../src/lib/transactions";
import { fakePayload } from "./helpers/fakePayload";

describe("the resale adjustment port", () => {
	it("fails closed until an adjuster is registered", () => {
		expect(() => getResaleAdjuster()).toThrowError(
			"resale adjuster unregistered — P8 not shipped",
		);
		try {
			getResaleAdjuster();
		} catch (error) {
			expect(error).toMatchObject({
				code: ERROR_CODES.badRequest,
				status: 500,
			});
		}
	});

	it("journals signed adjustments and unregisters without hiding missing providers", async () => {
		const first = new FakeResaleAdjuster();
		const removeFirst = registerResaleAdjuster(first);
		expect(getResaleAdjuster()).toBe(first);
		await withTransaction(fakePayload(), async (req) => {
			await first.adjustResellerCommission(req, "po-1", -1500, {
				source: "dispute",
				disputeId: "d-1",
			});
		});
		expect(first.journal()).toEqual([
			{
				purchaseOrder: "po-1",
				delta: -1500,
				meta: { source: "dispute", disputeId: "d-1" },
			},
		]);
		first.clear();
		expect(first.journal()).toEqual([]);
		removeFirst();
		expect(() => getResaleAdjuster()).toThrow();
	});

	it("reads only complete string or populated relationship snapshots", () => {
		expect(resaleParties({ id: "ordinary" })).toBeNull();
		expect(
			resaleParties({
				resale: {
					supplierShopId: 12,
					resellerShopId: "r",
					purchaseOrder: "po",
				},
			}),
		).toBeNull();
		expect(
			resaleParties({
				resale: {
					supplierShopId: "s",
					resellerShopId: "r",
					purchaseOrder: "po",
				},
			}),
		).toEqual({
			supplierShopId: "s",
			resellerShopId: "r",
			purchaseOrder: "po",
		});
		expect(
			resaleParties({
				supplierShop: { id: "s" },
				resellerShop: { id: "r" },
				purchaseOrder: { id: "po" },
			}),
		).toEqual({
			supplierShopId: "s",
			resellerShopId: "r",
			purchaseOrder: "po",
		});
	});

	it("compares normalized phone numbers without guessing country prefixes", () => {
		expect(collusionMatch("+237 650 00 00 00", ["+237650000000"])).toBe(true);
		expect(collusionMatch("+237650000000", ["+237651111111"])).toBe(false);
		expect(collusionMatch(null, ["+237650000000"])).toBe(false);
	});
});
