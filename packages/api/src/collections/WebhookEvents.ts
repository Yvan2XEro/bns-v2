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
			name: "provider",
			type: "select",
			required: true,
			options: [
				{ label: "NotchPay", value: "notchpay" },
				{ label: "Stripe", value: "stripe" },
			],
		},
		{ name: "providerEventId", type: "text", required: true },
		{ name: "type", type: "text" },
		{ name: "reference", type: "text", index: true },
		{ name: "payloadHash", type: "text", required: true },
		{ name: "raw", type: "json" },
		{ name: "receivedAt", type: "date", required: true },
		{ name: "processedAt", type: "date" },
		{ name: "attempts", type: "number", defaultValue: 0 },
		{ name: "lastError", type: "text" },
	],
	timestamps: true,
};
