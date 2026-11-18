import type { CollectionConfig } from "payload";
import { isAdmin } from "../access/roles";
import { shopField } from "../access/shopRoles";

export const STOCK_COUNT_SESSION_STATUSES = [
	"open",
	"completed",
	"cancelled",
] as const;

/**
 * A physical inventory in progress: who started it, where, and the counts
 * typed so far, so the count survives a reload or a change of device. Closing
 * it never moves stock by itself — the corrections are the `adjustment`
 * movements `recordStockCount` writes in the same transaction. Every write
 * goes through services/stockCountSessions.ts.
 */
export const StockCountSessions: CollectionConfig = {
	slug: "stock-count-sessions",
	admin: {
		defaultColumns: ["shop", "status", "startedBy", "startedAt", "completedAt"],
	},
	access: {
		read: ({ req: { user } }) => isAdmin(user),
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	fields: [
		shopField({ required: true, picker: false }),
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "open",
			index: true,
			options: STOCK_COUNT_SESSION_STATUSES.map((value) => ({
				label: value,
				value,
			})),
		},
		{
			name: "location",
			type: "relationship",
			relationTo: "shop-locations",
		},
		{ name: "startedBy", type: "relationship", relationTo: "users" },
		{ name: "startedAt", type: "date", required: true },
		{
			name: "counts",
			type: "json",
			admin: { description: "Typed counts by variant id, as entered." },
		},
		{ name: "completedBy", type: "relationship", relationTo: "users" },
		{ name: "completedAt", type: "date", index: true },
	],
	timestamps: true,
};
