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
		{
			type: "row",
			fields: [
				{
					name: "number",
					type: "text",
					required: true,
					unique: true,
					admin: { width: "50%" },
				},
				{
					name: "order",
					type: "relationship",
					relationTo: "orders",
					required: true,
					unique: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "supplierShop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					index: true,
					admin: { width: "33%" },
				},
				{
					name: "resellerShop",
					type: "relationship",
					relationTo: "shops",
					required: true,
					index: true,
					admin: { width: "33%" },
				},
				{
					name: "link",
					type: "relationship",
					relationTo: "resale-links",
					required: true,
					admin: { width: "34%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "status",
					type: "select",
					required: true,
					defaultValue: "sent",
					options: options(PURCHASE_ORDER_STATUSES),
					admin: { width: "50%" },
				},
				{
					name: "paymentMethod",
					type: "select",
					required: true,
					options: options(["cod", "mobile_money"]),
					admin: { width: "50%" },
				},
			],
		},
		{
			name: "items",
			type: "array",
			required: true,
			minRows: 1,
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "orderItem",
							type: "relationship",
							relationTo: "order-items",
							required: true,
							admin: { width: "50%" },
						},
						{
							name: "variant",
							type: "relationship",
							relationTo: "product-variants",
							required: true,
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "title",
							type: "text",
							required: true,
							admin: { width: "33%" },
						},
						{ name: "variantLabel", type: "text", admin: { width: "33%" } },
						{ name: "sku", type: "text", admin: { width: "34%" } },
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "quantity",
							type: "number",
							required: true,
							min: 1,
							admin: { width: "33%" },
						},
						{
							...money("supplierUnitPrice"),
							required: true,
							min: 1,
							admin: { width: "33%" },
						},
						{
							...money("resellerUnitPrice"),
							required: true,
							min: 1,
							admin: { width: "34%" },
						},
					],
				},
			],
		},
		{
			type: "row",
			fields: [
				{ ...money("supplierAmount"), admin: { width: "33%" } },
				{
					name: "deliveryFee",
					type: "number",
					required: true,
					min: 0,
					admin: { width: "33%" },
				},
				{
					name: "collectAmount",
					type: "number",
					required: true,
					min: 0,
					admin: { width: "34%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{ ...money("platformCommission"), admin: { width: "50%" } },
				{ ...money("resellerCommission"), admin: { width: "50%" } },
			],
		},
		{
			name: "branding",
			type: "group",
			required: true,
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "name",
							type: "text",
							required: true,
							admin: { width: "50%" },
						},
						{
							name: "handle",
							type: "text",
							required: true,
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "logo",
							type: "upload",
							relationTo: "media",
							admin: { width: "50%" },
						},
						{ name: "phone", type: "text", admin: { width: "50%" } },
					],
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "sentAt",
					type: "date",
					required: true,
					admin: { width: "50%" },
				},
				{
					name: "acceptBy",
					type: "date",
					required: true,
					admin: { width: "50%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{ name: "acceptedAt", type: "date", admin: { width: "50%" } },
				{ name: "shipBy", type: "date", admin: { width: "50%" } },
			],
		},
		{
			name: "tracking",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "carrier",
							type: "select",
							options: options(["own_courier", "yango", "other"]),
							admin: { width: "50%" },
						},
						{ name: "trackingNumber", type: "text", admin: { width: "50%" } },
					],
				},
				{
					type: "row",
					fields: [
						{ name: "trackingUrl", type: "text", admin: { width: "50%" } },
						{
							name: "shipment",
							type: "relationship",
							relationTo: "shipments",
							admin: { width: "50%" },
						},
					],
				},
			],
		},
		{
			name: "cancellation",
			type: "group",
			fields: [
				{
					type: "row",
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
							admin: { width: "50%" },
						},
						{ name: "reason", type: "text", admin: { width: "50%" } },
					],
				},
				{ name: "note", type: "textarea" },
				{ name: "at", type: "date" },
			],
		},
		{
			name: "return",
			type: "group",
			fields: [
				{
					type: "row",
					fields: [
						{ name: "reason", type: "text", admin: { width: "50%" } },
						{
							name: "liability",
							type: "select",
							options: options(["supplier", "reseller", "buyer"]),
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "failedDeliveryCost",
							type: "number",
							min: 0,
							admin: { width: "33%" },
						},
						{ name: "receivedAt", type: "date", admin: { width: "33%" } },
						{
							name: "condition",
							type: "select",
							options: options(["resellable", "damaged"]),
							admin: { width: "34%" },
						},
					],
				},
			],
		},
		{
			name: "statusHistory",
			type: "array",
			fields: [
				{
					type: "row",
					fields: [
						{
							name: "status",
							type: "text",
							required: true,
							admin: { width: "50%" },
						},
						{
							name: "actor",
							type: "relationship",
							relationTo: "users",
							admin: { width: "50%" },
						},
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "source",
							type: "text",
							required: true,
							admin: { width: "50%" },
						},
						{
							name: "at",
							type: "date",
							required: true,
							admin: { width: "50%" },
						},
					],
				},
			],
		},
	],
	timestamps: true,
};
