// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	createReturnInspectionFormSchema,
	returnRefundProofFormSchema,
	returnRefundProofInputSchema,
} from "../../src/contracts/returnInputs";

const item = { orderItemId: "item-1", unitPrice: 5000, quantity: 2 };
const inspection = {
	orderItemId: "item-1",
	outcome: "damaged_by_buyer",
	deductionAmount: "4000",
	note: "Broken after use",
	evidenceIds: ["photo-1"],
};

describe("shared seller return forms", () => {
	it("requires an explicit inspection outcome and converts money to an integer", () => {
		const schema = createReturnInspectionFormSchema("withdrawal", [item]);
		expect(
			schema.safeParse({ items: [{ ...inspection, outcome: "" }] }).success,
		).toBe(false);
		expect(schema.parse({ items: [inspection] })).toEqual({
			items: [{ ...inspection, deductionAmount: 4000 }],
		});
	});
	it("refuses a deduction without item evidence, a note, or within a non-conformity case", () => {
		const schema = createReturnInspectionFormSchema("withdrawal", [item]);
		for (const patch of [
			{ evidenceIds: [] },
			{ note: " " },
			{ deductionAmount: "10001" },
		]) {
			expect(
				schema.safeParse({ items: [{ ...inspection, ...patch }] }).success,
			).toBe(false);
		}
		expect(
			createReturnInspectionFormSchema("non_conformity", [item]).safeParse({
				items: [inspection],
			}).success,
		).toBe(false);
	});
	it("accepts a zero deduction without proof and rejects fractional or unsafe amounts", () => {
		const schema = createReturnInspectionFormSchema("withdrawal", [item]);
		expect(
			schema.parse({
				items: [
					{ ...inspection, deductionAmount: "0", note: "", evidenceIds: [] },
				],
			}).items[0]?.deductionAmount,
		).toBe(0);
		for (const amount of ["1.5", "-1", "9007199254740992"]) {
			expect(
				schema.safeParse({
					items: [{ ...inspection, deductionAmount: amount }],
				}).success,
			).toBe(false);
		}
	});
	it("requires uploaded proof and a transaction reference for a mobile money refund", () => {
		const input = {
			method: "mtn_momo",
			transactionId: " tx-1 ",
			amount: "1000",
			evidenceIds: ["proof-1"],
		};
		expect(returnRefundProofFormSchema.parse(input)).toEqual({
			...input,
			amount: 1000,
			transactionId: "tx-1",
		});
		expect(
			returnRefundProofFormSchema.safeParse({ ...input, transactionId: " " })
				.success,
		).toBe(false);
		expect(
			returnRefundProofFormSchema.safeParse({ ...input, evidenceIds: [] })
				.success,
		).toBe(false);
		expect(
			returnRefundProofInputSchema.parse({ ...input, amount: 1000 }),
		).toEqual({ ...input, amount: 1000, transactionId: "tx-1" });
	});
});
