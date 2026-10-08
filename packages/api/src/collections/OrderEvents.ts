import type { CollectionConfig } from "payload";
import { staffOnly } from "../access/staff";

/**
 * P4's own types. `order.paid` (P5) and `order.disputed` / `order.returned`
 * (P6) are reserved — named in the spec, not declared here — the same way
 * their `orders.status` values are reserved without being written by P4.
 */
export const ORDER_EVENT_TYPES = [
	"order.disputed",
	"order.dispute_resolved",
	"order.dispute_withdrawn",
	"order.returned",
	"order.placed",
	"order.receipt_sent",
	"order.confirmation_code_sent",
	"order.confirmed",
	"order.accepted",
	"order.purchase_order_sent",
	"order.purchase_order_accepted",
	"order.declined",
	"order.accept_reminder_sent",
	"order.shipped",
	"order.handover_code_sent",
	"order.handover_code_regenerated",
	"order.handover_failed_attempt",
	"order.handover_locked",
	"order.delivery_attempt_failed",
	"order.delivered",
	"order.delivery_contested",
	"order.delivery_failed",
	"order.cancelled",
	"order.withdrawal_requested",
	"order.return_cancelled",
	"order.return_expired",
	"order.return_refunded",
	"order.completed",
	"order.commission_accrued",
	"order.note_added",
	"order.address_updated",
] as const;

/**
 * The order's append-only timeline (art. 26 burden of proof): only
 * `services/orders` writes it, inside the same transaction as the change it
 * records. `create`, `update` and `delete` are all closed to every request —
 * there is deliberately no `beforeChange`/`beforeDelete` hook either,
 * because a hook is one more place a "just this once" exception could be
 * added; `access` alone is the whole rule, and a service write uses
 * `overrideAccess` to get past it.
 */
export const OrderEvents: CollectionConfig = {
	slug: "order-events",
	admin: {
		useAsTitle: "type",
		defaultColumns: ["order", "type", "actorType", "createdAt"],
	},
	access: {
		read: staffOnly,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	fields: [
		{
			name: "order",
			type: "relationship",
			relationTo: "orders",
			required: true,
			index: true,
		},
		{
			name: "type",
			type: "select",
			required: true,
			index: true,
			options: ORDER_EVENT_TYPES.map((value) => ({ label: value, value })),
		},
		{
			name: "actorType",
			type: "select",
			options: [
				{ label: "Buyer", value: "buyer" },
				{ label: "Seller", value: "seller" },
				{ label: "Staff", value: "staff" },
				{ label: "System", value: "system" },
				{ label: "Courier", value: "courier" },
			],
		},
		{ name: "actor", type: "relationship", relationTo: "users" },
		{
			name: "actorShopRole",
			type: "select",
			options: [
				{ label: "Owner", value: "owner" },
				{ label: "Manager", value: "manager" },
				{ label: "Staff", value: "staff" },
			],
		},
		{ name: "statusFrom", type: "text" },
		{ name: "statusTo", type: "text" },
		{ name: "paymentStatusFrom", type: "text" },
		{ name: "paymentStatusTo", type: "text" },
		{
			name: "items",
			type: "array",
			fields: [
				{ name: "orderItem", type: "relationship", relationTo: "order-items" },
				{ name: "fulfillmentFrom", type: "text" },
				{ name: "fulfillmentTo", type: "text" },
			],
		},
		{ name: "reason", type: "text" },
		{ name: "note", type: "text" },
		// Never codes or hashes — the order's own `codeHash` fields are closed
		// to read for everyone; this must not become the back door that undoes
		// that.
		{ name: "metadata", type: "json" },
		{
			name: "visibility",
			type: "select",
			required: true,
			options: [
				{ label: "Buyer", value: "buyer" },
				{ label: "Shop", value: "shop" },
				{ label: "Both", value: "both" },
				{ label: "Staff", value: "staff" },
			],
		},
		{
			name: "source",
			type: "select",
			options: [
				{ label: "Web", value: "web" },
				{ label: "iOS", value: "ios" },
				{ label: "Android", value: "android" },
				{ label: "Job", value: "job" },
				{ label: "Staff console", value: "staff_console" },
				{ label: "Webhook", value: "webhook" },
			],
		},
	],
	timestamps: true,
};
