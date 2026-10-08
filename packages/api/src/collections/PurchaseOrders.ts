import type { Access, CollectionConfig, FieldAccess, Where } from "payload";
import { isModerator } from "../access/roles";
import { can, memberShopIds, resolveShopRole } from "../access/shopRoles";
import { nobody } from "../access/staff";
import { PURCHASE_ORDER_STATUSES } from "../contracts/purchaseOrders";
import { relationId } from "../lib/relationId";

const partyRead: Access = async ({ req }) => {
	if (isModerator(req.user)) return true;
	const shops = await memberShopIds(req);
	if (shops.length === 0) return false;
	const where: Where = {
		or: [{ supplierShop: { in: shops } }, { resellerShop: { in: shops } }],
	};
	return where;
};

const purchaseOrderMoneyRead: FieldAccess = async ({ req, doc }) => {
	if (isModerator(req.user)) return true;
	const userId = relationId(req.user);
	if (!userId || !doc) return false;
	const record = doc as Record<string, unknown>;
	const roles = await Promise.all(
		[record.supplierShop, record.resellerShop].map((shop) =>
			resolveShopRole(req.payload, userId, relationId(shop), req.context),
		),
	);
	return roles.some((role) => can(role, "payments.view"));
};

const options = (values: readonly string[]) =>
	values.map((value) => ({ label: value, value }));

const money = (name: string) => ({
	name,
	type: "number" as const,
	required: true,
	min: 0,
	access: { read: purchaseOrderMoneyRead },
});

export const PurchaseOrders: CollectionConfig = {
	slug: "purchase-orders",
	admin: {
		useAsTitle: "number",
		defaultColumns: ["number", "supplierShop", "resellerShop", "status"],
		group: "Resale",
	},
	access: {
		read: partyRead,
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	indexes: [
		{ fields: ["supplierShop", "status"] },
		{ fields: ["resellerShop", "status"] },
	],
	fields: [
		{ name: "number", type: "text", required: true, unique: true },
		{
			name: "order",
			type: "relationship",
			relationTo: "orders",
			required: true,
			unique: true,
		},
		{
			name: "supplierShop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "resellerShop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "link",
			type: "relationship",
			relationTo: "resale-links",
			required: true,
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "sent",
			options: options(PURCHASE_ORDER_STATUSES),
		},
		{
			name: "paymentMethod",
			type: "select",
			required: true,
			options: options(["cod", "mobile_money"]),
		},
		{
			name: "items",
			type: "array",
			required: true,
			minRows: 1,
			fields: [
				{
					name: "orderItem",
					type: "relationship",
					relationTo: "order-items",
					required: true,
				},
				{
					name: "variant",
					type: "relationship",
					relationTo: "product-variants",
					required: true,
				},
				{ name: "title", type: "text", required: true },
				{ name: "variantLabel", type: "text" },
				{ name: "sku", type: "text" },
				{ name: "quantity", type: "number", required: true, min: 1 },
				{ ...money("supplierUnitPrice"), required: true, min: 1 },
				{ ...money("resellerUnitPrice"), required: true, min: 1 },
			],
		},
		money("supplierAmount"),
		{ name: "deliveryFee", type: "number", required: true, min: 0 },
		{
			name: "collectAmount",
			type: "number",
			required: true,
			min: 0,
		},
		money("platformCommission"),
		money("resellerCommission"),
		{
			name: "branding",
			type: "group",
			required: true,
			fields: [
				{ name: "name", type: "text", required: true },
				{ name: "handle", type: "text", required: true },
				{ name: "logo", type: "upload", relationTo: "media" },
				{ name: "phone", type: "text" },
			],
		},
		{ name: "sentAt", type: "date", required: true },
		{ name: "acceptBy", type: "date", required: true },
		{ name: "acceptedAt", type: "date" },
		{ name: "shipBy", type: "date" },
		{
			name: "tracking",
			type: "group",
			fields: [
				{
					name: "carrier",
					type: "select",
					options: options(["own_courier", "yango", "other"]),
				},
				{ name: "trackingNumber", type: "text" },
				{ name: "trackingUrl", type: "text" },
				{ name: "shipment", type: "relationship", relationTo: "shipments" },
			],
		},
		{
			name: "cancellation",
			type: "group",
			fields: [
				{
					name: "by",
					type: "select",
					options: options([
						"supplier",
						"reseller",
						"buyer",
						"system",
						"staff",
					]),
				},
				{ name: "reason", type: "text" },
				{ name: "note", type: "textarea" },
				{ name: "at", type: "date" },
			],
		},
		{
			name: "return",
			type: "group",
			fields: [
				{ name: "reason", type: "text" },
				{
					name: "liability",
					type: "select",
					options: options(["supplier", "reseller", "buyer"]),
				},
				{ name: "failedDeliveryCost", type: "number", min: 0 },
				{ name: "receivedAt", type: "date" },
				{
					name: "condition",
					type: "select",
					options: options(["resellable", "damaged"]),
				},
			],
		},
		{
			name: "statusHistory",
			type: "array",
			fields: [
				{ name: "status", type: "text", required: true },
				{ name: "actor", type: "relationship", relationTo: "users" },
				{ name: "source", type: "text", required: true },
				{ name: "at", type: "date", required: true },
			],
		},
	],
	timestamps: true,
};
