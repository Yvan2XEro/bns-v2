import { z } from "zod";
import { ERROR_CODES } from "../lib/errors";
import { deductionAllowed } from "./caseRules";
import type { ReturnCaseView } from "./returns";

export const RETURN_INSPECTION_OUTCOMES = [
	"restock",
	"damaged_by_buyer",
	"damaged_in_transit",
	"not_matching",
	"missing",
] as const;
export const RETURN_REFUND_METHODS = [
	"cash",
	"mtn_momo",
	"orange_money",
] as const;

const evidenceIds = z.array(z.string().trim().min(1)).max(10);
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const moneyText = z
	.string()
	.trim()
	.regex(/^\d+$/, ERROR_CODES.returnItemsInvalid)
	.transform(Number)
	.pipe(money);
const inspectionItem = z.object({
	orderItemId: z.string().trim().min(1),
	outcome: z.enum(RETURN_INSPECTION_OUTCOMES),
	deductionAmount: money.optional(),
	note: z.string().trim().max(1000).optional(),
	evidenceIds: evidenceIds.optional(),
});

function requireDeductionProof(
	item: z.output<typeof inspectionItem>,
	context: z.RefinementCtx,
	path: (string | number)[],
) {
	if ((item.deductionAmount ?? 0) <= 0) return;
	for (const field of ["note", "evidenceIds"] as const) {
		if (!item[field]?.length)
			context.addIssue({
				code: "custom",
				path: [...path, field],
				message: ERROR_CODES.returnDeductionEvidenceRequired,
			});
	}
}

export const returnInspectionInputSchema = z
	.object({ items: z.array(inspectionItem).min(1).max(50) })
	.superRefine((value, context) => {
		value.items.forEach((item, index) => {
			requireDeductionProof(item, context, ["items", index]);
		});
	});

export function createReturnInspectionFormSchema(
	basis: ReturnCaseView["basis"],
	items: readonly Pick<
		ReturnCaseView["items"][number],
		"orderItemId" | "quantity" | "unitPrice"
	>[],
) {
	const originals = new Map(items.map((item) => [item.orderItemId, item]));
	return z
		.object({
			items: z
				.array(
					inspectionItem.extend({
						outcome: z.string().pipe(z.enum(RETURN_INSPECTION_OUTCOMES)),
						deductionAmount: moneyText,
						note: z.string().trim().max(1000),
						evidenceIds,
					}),
				)
				.min(1)
				.max(50),
		})
		.superRefine((value, context) => {
			const ids = new Set(value.items.map((item) => item.orderItemId));
			if (value.items.length !== items.length || ids.size !== originals.size) {
				context.addIssue({
					code: "custom",
					path: ["items"],
					message: ERROR_CODES.returnItemsInvalid,
				});
			}
			value.items.forEach((item, index) => {
				const original = originals.get(item.orderItemId);
				if (!original) {
					context.addIssue({
						code: "custom",
						path: ["items", index, "orderItemId"],
						message: ERROR_CODES.returnItemsInvalid,
					});
					return;
				}
				const allowed = deductionAllowed({
					basis,
					itemPrice: original.unitPrice * original.quantity,
					amount: item.deductionAmount,
				});
				if (item.deductionAmount > 0 && !allowed.ok) {
					context.addIssue({
						code: "custom",
						path: ["items", index, "deductionAmount"],
						message: allowed.code,
					});
				}
				requireDeductionProof(item, context, ["items", index]);
			});
		});
}

const refundProof = z.object({
	method: z.enum(RETURN_REFUND_METHODS),
	transactionId: z.string().trim().max(200).optional(),
	amount: money.positive(),
	evidenceIds: evidenceIds.min(1),
});

function requireTransactionReference(
	value: z.output<typeof refundProof>,
	context: z.RefinementCtx,
) {
	if (value.method !== "cash" && !value.transactionId)
		context.addIssue({
			code: "custom",
			path: ["transactionId"],
			message: ERROR_CODES.returnRefundProofInvalid,
		});
}

export const returnRefundProofInputSchema = refundProof.superRefine(
	requireTransactionReference,
);
export const returnRefundProofFormSchema = refundProof
	.extend({ amount: moneyText.pipe(money.positive()) })
	.superRefine(requireTransactionReference);

export type ReturnInspectionFormInput = z.input<
	ReturnType<typeof createReturnInspectionFormSchema>
>;
export type ReturnInspectionFormOutput = z.output<
	ReturnType<typeof createReturnInspectionFormSchema>
>;
export type ReturnRefundProofFormInput = z.input<
	typeof returnRefundProofFormSchema
>;
export type ReturnRefundProofInput = z.output<
	typeof returnRefundProofInputSchema
>;

export const SELLER_RETURN_ACTIONS = [
	"pickup",
	"receive",
	"inspect",
	"refund_proof",
] as const;
