import { describe, expect, test } from "bun:test";
import type { OrderView } from "../types/order";
import { declineBuyerArea, declineEffects } from "./declineRecap";

const delivery = {
	recipientName: "Carine T.",
	city: "Douala",
	district: "Bonanjo",
	districtOther: null,
} as OrderView["delivery"];

describe("declineEffects", () => {
	test("promises a full refund only for a paid protected order", () => {
		const paid = declineEffects(
			{
				paymentMethod: "mobile_money",
				paymentStatus: "paid",
				buyer: { id: "u-1", name: "Carine T." },
				delivery,
			},
			"267 000 XAF",
		);
		expect(paid[0]).toEqual({
			key: "sellerOrders.declineEffects.refund",
			values: { buyer: "Carine T.", amount: "267 000 XAF" },
			icon: "refund",
		});
		const cod = declineEffects(
			{ paymentMethod: "cod", paymentStatus: "cod_pending", delivery },
			"267 000 XAF",
		);
		expect(cod[0].key).toBe("sellerOrders.declineEffects.nothingPaid");
		expect(cod[1].values).toEqual({ buyer: "Carine T." });
	});

	test("states the server's refusal-rate threshold", () => {
		const rate = declineEffects(
			{ paymentMethod: "cod", paymentStatus: "cod_pending", delivery },
			"",
		).find((effect) => effect.icon === "rate");
		expect(rate?.values).toEqual({ threshold: 10, min: 5 });
	});
});

describe("declineBuyerArea", () => {
	test("prefers the district the buyer typed", () => {
		expect(declineBuyerArea({ delivery })).toBe("Bonanjo, Douala");
		expect(
			declineBuyerArea({
				delivery: { ...delivery, districtOther: "Akwa Nord" },
			}),
		).toBe("Akwa Nord, Douala");
	});
});
