import { describe, expect, test } from "bun:test";
import type { OrderView } from "~/types/order";
import { amountToCollect, slipAddress, slipIds } from "./delivery-slip";

const amounts = { total: 15000 } as OrderView["amounts"];

describe("delivery slip", () => {
	test("asks for cash only on an unpaid cash-on-delivery order", () => {
		expect(
			amountToCollect({
				paymentMethod: "cod",
				paymentStatus: "cod_pending",
				amounts,
			}),
		).toBe(15000);
		expect(
			amountToCollect({
				paymentMethod: "cod",
				paymentStatus: "cod_collected",
				amounts,
			}),
		).toBe(0);
		expect(
			amountToCollect({
				paymentMethod: "mobile_money",
				paymentStatus: "paid",
				amounts,
			}),
		).toBe(0);
	});

	test("writes the address landmark first and skips blanks", () => {
		expect(
			slipAddress({
				landmark: "Face pharmacie",
				district: "makepe",
				districtOther: null,
				city: "Douala",
			} as OrderView["delivery"]),
		).toEqual(["Face pharmacie", "makepe", "Douala"]);
	});

	test("reads at most fifty distinct ids", () => {
		expect(slipIds("a,b,a,,c")).toEqual(["a", "b", "c"]);
		expect(slipIds(null)).toEqual([]);
	});
});
