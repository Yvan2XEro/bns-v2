import type { CollectionConfig } from "payload";
import { nobody, staffOnly } from "../access/staff";

/** Every verified provider event, stored once before it is processed. */
export const WebhookEvents: CollectionConfig = {
	slug: "webhook-events",
	admin: {
		useAsTitle: "providerEventId",
		defaultColumns: [
			"provider",
			"type",
			"reference",
			"providerReference",
			"receivedAt",
			"processedAt",
			"attempts",
		],
	},
	access: {
		read: staffOnly,
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	indexes: [{ fields: ["provider", "providerEventId"], unique: true }],
	fields: [
		{
			type: "row",
			fields: [
				{
					name: "provider",
					type: "select",
					required: true,
					options: [
						{ label: "NotchPay", value: "notchpay" },
						{ label: "Stripe", value: "stripe" },
						{ label: "Didit", value: "didit" },
						{ label: "Smile ID", value: "smileid" },
						// The shared FakeMarketplaceProvider signs every webhook in tests
						// and staging (lib/payments/marketplaceRegistry.ts).
						{ label: "Fake marketplace (test/staging)", value: "fake" },
						{ label: "Yango delivery", value: "yango" },
						{ label: "Campost delivery", value: "campost" },
					],
					admin: { width: "33%" },
				},
				{
					name: "providerEventId",
					type: "text",
					required: true,
					admin: { width: "33%" },
				},
				{ name: "type", type: "text", admin: { width: "34%" } },
			],
		},
		{ name: "reference", type: "text", index: true },
		/**
		 * The provider's own transaction id, kept beside our reference because
		 * the account-deletion sweep has to find this row by either one: our
		 * reference is absent from any Stripe event that is not
		 * `checkout.session.*` and from a NotchPay body with no merchant
		 * reference, and those bodies still carry the customer's details.
		 */
		{ name: "providerReference", type: "text", index: true },
		{ name: "payloadHash", type: "text", required: true },
		{ name: "raw", type: "json" },
		{
			type: "row",
			fields: [
				{
					name: "receivedAt",
					type: "date",
					required: true,
					admin: { width: "33%" },
				},
				{ name: "processedAt", type: "date", admin: { width: "33%" } },
				{
					name: "attempts",
					type: "number",
					defaultValue: 0,
					admin: { width: "34%" },
				},
			],
		},
		{ name: "lastError", type: "text" },
	],
	timestamps: true,
};
