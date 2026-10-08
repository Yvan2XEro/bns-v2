import type { Access, CollectionConfig, FieldAccess, Where } from "payload";
import { isModerator } from "../access/roles";
import { can, resolveShopRole } from "../access/shopRoles";
import { relationId } from "../lib/relationId";

const shopDailyStatsRead: Access = async ({ req }) => {
	if (isModerator(req.user)) return true;
	if (!req.user) return false;
	const members = await req.payload.find({
		collection: "shop-members",
		where: {
			and: [
				{ user: { equals: req.user.id } },
				{ status: { equals: "active" } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const context = req.context;
	const shops: string[] = [];
	for (const member of members.docs) {
		const shopId = relationId(member.shop);
		if (!shopId) continue;
		const role = await resolveShopRole(
			req.payload,
			String(req.user.id),
			shopId,
			context,
		);
		if (can(role, "costs.view")) shops.push(shopId);
	}
	return shops.length ? ({ shop: { in: shops } } satisfies Where) : false;
};

const costFieldAccess: FieldAccess = async ({ req, doc }) => {
	if (isModerator(req.user)) return true;
	if (!req.user || !doc) return false;
	const shopId = relationId(doc.shop);
	if (!shopId) return false;
	const role = await resolveShopRole(
		req.payload,
		String(req.user.id),
		shopId,
		req.context,
	);
	return can(role, "costs.view");
};

const count = (name: string) => ({
	name,
	type: "number" as const,
	min: 0,
	defaultValue: 0,
});

export const ShopDailyStats: CollectionConfig = {
	slug: "shop-daily-stats",
	admin: {
		useAsTitle: "date",
		defaultColumns: ["shop", "date", "views", "ordersPlaced", "gmvDelivered"],
		group: "Insights",
	},
	access: {
		read: shopDailyStatsRead,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	indexes: [{ fields: ["shop", "date"], unique: true }],
	fields: [
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{ name: "date", type: "text", required: true, index: true },
		...[
			"views",
			"phoneReveals",
			"favouritesAdded",
			"conversationsStarted",
			"ordersPlaced",
			"ordersConfirmed",
			"ordersAccepted",
			"ordersDelivered",
			"ordersCancelledBySeller",
			"ordersCancelledByBuyer",
			"codShipped",
			"codRefused",
			"unitsDelivered",
			"outOfStockVariants",
			"lowStockVariants",
			"awaitingReply",
		].map(count),
		{ name: "gmvDelivered", type: "number", min: 0, defaultValue: 0 },
		{
			name: "cogsDelivered",
			type: "number",
			min: 0,
			defaultValue: 0,
			access: { read: costFieldAccess },
		},
		{
			name: "inventoryCostValue",
			type: "number",
			min: 0,
			defaultValue: 0,
			access: { read: costFieldAccess },
		},
		{
			name: "responseBuckets",
			type: "group",
			fields: ["m5", "m15", "h1", "h4", "h24", "over24h", "unanswered"].map(
				count,
			),
		},
		{
			name: "topProducts",
			type: "array",
			maxRows: 10,
			fields: [
				{ name: "product", type: "relationship", relationTo: "products" },
				{ name: "listing", type: "relationship", relationTo: "listings" },
				count("views"),
				count("ordersPlaced"),
				count("unitsDelivered"),
				{ name: "gmvDelivered", type: "number", min: 0, defaultValue: 0 },
			],
		},
		{
			name: "resale",
			type: "group",
			fields: [
				count("purchaseOrdersReceived"),
				count("purchaseOrdersAcceptedInTime"),
				count("purchaseOrdersCancelledBySupplier"),
				count("resaleDelivered"),
				{ name: "commissionAccrued", type: "number", min: 0, defaultValue: 0 },
			],
		},
		{ name: "computedAt", type: "date" },
		{ name: "version", type: "number", defaultValue: 1 },
		{ name: "metricsHash", type: "text", required: true },
	],
	timestamps: true,
};
