import type { CollectionConfig } from "payload";
import { staffOnly } from "../access/staff";
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
 * One line per order. `purchaseOrder` (reserved for P8's resale sourcing) is
 * not declared here: it would relate to a `purchase-orders` collection that
 * does not exist until P8 creates it, and a `relationTo` naming an
 * unregistered slug has no safe meaning in Payload. P8 adds the field
 * alongside that collection.
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
			name: "order",
			type: "relationship",
			relationTo: "orders",
			required: true,
			index: true,
		},
		{ name: "lineNumber", type: "number" },
		{ name: "listing", type: "relationship", relationTo: "listings" },
		{
			name: "product",
			type: "relationship",
			relationTo: "products",
			required: true,
		},
		{
			name: "variant",
			type: "relationship",
			relationTo: "product-variants",
			required: true,
			index: true,
		},
		{
			name: "sourcing",
			type: "select",
			defaultValue: "own",
			options: [
				{ label: "Own", value: "own" },
				{ label: "Resale", value: "resale" },
			],
		},
		{
			name: "fulfillingShop",
			type: "relationship",
			relationTo: "shops",
			required: true,
		},
		{
			name: "snapshot",
			type: "group",
			fields: [
				{ name: "title", type: "text" },
				{ name: "variantLabel", type: "text" },
				{ name: "sku", type: "text" },
				{ name: "imageUrl", type: "text" },
				{ name: "categoryId", type: "text" },
				{ name: "condition", type: "text" },
				{ name: "returnPolicy", type: "text" },
			],
		},
		{ name: "unitPrice", type: "number", required: true },
		{ name: "quantity", type: "number", required: true, min: 1, max: 20 },
		{ name: "lineSubtotal", type: "number" },
		{ name: "commissionRateBps", type: "number" },
		{ name: "commissionAmount", type: "number" },
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
			admin: { readOnly: true },
		},
		{ name: "stockTracked", type: "checkbox", defaultValue: false },
		{ name: "returnedQuantity", type: "number", defaultValue: 0 },
	],
	timestamps: true,
};
