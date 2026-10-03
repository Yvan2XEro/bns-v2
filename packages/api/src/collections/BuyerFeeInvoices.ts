import type { CollectionConfig } from "payload";
import { isModerator } from "../access/roles";
import { nobody } from "../access/staff";

export const BUYER_FEE_INVOICE_KINDS = ["invoice", "credit_note"] as const;

/**
 * The buyer protection fee is a service BuyNSellem sells to the buyer, so the
 * invoice is the buyer's: the shop does not read it. `number` is
 * `BNS-F-{year}-{seq}` from P4's `nextInvoiceNumber("F", issuedAt)`.
 */
export const BuyerFeeInvoices: CollectionConfig = {
	slug: "buyer-fee-invoices",
	admin: {
		useAsTitle: "number",
		defaultColumns: ["number", "kind", "buyer", "amountTtc", "issuedAt"],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) return false;
			if (isModerator(user as { role?: string })) return true;
			return { buyer: { equals: user.id } };
		},
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	fields: [
		{ name: "number", type: "text", required: true, unique: true },
		{
			name: "kind",
			type: "select",
			required: true,
			defaultValue: "invoice",
			options: BUYER_FEE_INVOICE_KINDS.map((value) => ({
				label: value,
				value,
			})),
		},
		{
			name: "creditsInvoice",
			type: "relationship",
			relationTo: "buyer-fee-invoices",
			validate: (value: unknown, { siblingData }: { siblingData: unknown }) =>
				(siblingData as { kind?: unknown }).kind !== "credit_note" ||
				Boolean(value) ||
				"A credit note names the invoice it credits.",
		},
		{
			name: "order",
			type: "relationship",
			relationTo: "orders",
			required: true,
			index: true,
		},
		{ name: "buyer", type: "relationship", relationTo: "users", index: true },
		{ name: "amountHt", type: "number", required: true },
		{ name: "vat", type: "number", required: true },
		{ name: "amountTtc", type: "number", required: true },
		{ name: "vatRateBps", type: "number", required: true },
		// Bilingual FR/EN (Law 2011/012 art. 6).
		{ name: "pdf", type: "upload", relationTo: "buyer-fee-invoice-files" },
		{ name: "issuedAt", type: "date", required: true },
	],
	timestamps: true,
};
