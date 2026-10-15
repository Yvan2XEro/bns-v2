import type { CollectionConfig } from "payload";
import { staffOnly, staffOnlyField } from "../access/staff";
import { getOrderSettings } from "../lib/orderSettings";

export const ORDER_ITEM_FULFILLMENT_STATUSES = [
	"unfulfilled",
	"shipped",
	"delivered",
	"failed",
	"cancelled",
	"return_requested",
	"returned",
] as const;

/**
 * One line per order, including its supplier-side snapshot for resale.
 */
export const OrderItems: CollectionConfig = {
	slug: "order-items",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["order", "product", "quantity", "fulfillmentStatus"],
	},
	access: {
		read: staffOnly,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	hooks: {
		beforeChange: [
			async ({ data, operation, req }) => {
				if (operation !== "create") return data;
				if (data.commissionRateBps == null) {
					const settings = await getOrderSettings(req.payload);
					data.commissionRateBps = settings.defaultCommissionRateBps;
				}
				return data;
			},
			// `fulfillmentStatus` and the `snapshot` group are both written once
			// by the order service and pinned afterwards, the same way
			// `Orders.status` is: REST is the path that can bypass the service.
			async ({ data, operation, originalDoc, req }) => {
				if (operation !== "update") return data;
				if (req.context?.orderService === true) return data;
				data.fulfillmentStatus = originalDoc?.fulfillmentStatus;
				data.snapshot = originalDoc?.snapshot;
				return data;
			},
		],
	},
	fields: [
		{
			type: "row",
			fields: [
				{
					name: "order",
					type: "relationship",
					relationTo: "orders",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
				{ name: "lineNumber", type: "number", admin: { width: "50%" } },
			],
		},
		{ name: "listing", type: "relationship", relationTo: "listings" },
		{
			type: "row",
			fields: [
				{
					name: "product",
					type: "relationship",
					relationTo: "products",
					required: true,
					admin: { width: "50%" },
				},
				{
					name: "variant",
					type: "relationship",
					relationTo: "product-variants",
					required: true,
					index: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "sourcing",
					type: "select",
					defaultValue: "own",
					options: [
						{ label: "Own", value: "own" },
						{ label: "Resale", value: "resale" },
					],
					admin: { width: "50%" },
				},
				{
					name: "fulfillingShop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "purchaseOrder",
					type: "relationship",
					relationTo: "purchase-orders",
					index: true,
					admin: { width: "33%" },
				},
				{
					name: "resaleLink",
					type: "relationship",
					relationTo: "resale-links",
					admin: { width: "33%" },
				},
				{
					name: "supplierUnitPrice",
					type: "number",
					min: 0,
					access: { read: staffOnlyField },
					admin: { width: "34%" },
				},
			],
		},
		{
			name: "snapshot",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{ name: "title", type: "text", admin: { width: "33%" } },
						{ name: "variantLabel", type: "text", admin: { width: "33%" } },
						{ name: "sku", type: "text", admin: { width: "34%" } },
					],
				},
				{
					type: "row",
					fields: [
						{ name: "imageUrl", type: "text", admin: { width: "50%" } },
						{ name: "categoryId", type: "text", admin: { width: "50%" } },
					],
				},
				{
					type: "row",
					fields: [
						{ name: "condition", type: "text", admin: { width: "50%" } },
						{ name: "returnPolicy", type: "text", admin: { width: "50%" } },
					],
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "unitPrice",
					type: "number",
					required: true,
					admin: { width: "33%" },
				},
				{
					name: "quantity",
					type: "number",
					required: true,
					min: 1,
					max: 20,
					admin: { width: "33%" },
				},
				{ name: "lineSubtotal", type: "number", admin: { width: "34%" } },
			],
		},
		{
			type: "row",
			fields: [
				{ name: "commissionRateBps", type: "number", admin: { width: "50%" } },
				{ name: "commissionAmount", type: "number", admin: { width: "50%" } },
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "fulfillmentStatus",
					type: "select",
					required: true,
					defaultValue: "unfulfilled",
					index: true,
					options: ORDER_ITEM_FULFILLMENT_STATUSES.map((value) => ({
						label: value,
						value,
					})),
					admin: { width: "33%", readOnly: true },
				},
				{
					name: "stockTracked",
					type: "checkbox",
					defaultValue: false,
					admin: { width: "33%" },
				},
				{
					name: "returnedQuantity",
					type: "number",
					defaultValue: 0,
					admin: { width: "34%" },
				},
			],
		},
	],
	timestamps: true,
};
