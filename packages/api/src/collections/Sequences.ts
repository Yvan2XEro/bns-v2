import type { CollectionConfig } from "payload";

/**
 * Counters, not documents. Every operation is a `findOneAndUpdate` with
 * `$inc` through `services/sequences.ts`; nothing else may read or write
 * them, because a number read and then written is a number two checkouts can
 * share.
 */
export const Sequences: CollectionConfig = {
	slug: "sequences",
	admin: { useAsTitle: "key", hidden: true },
	access: {
		read: () => false,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	fields: [
		{ name: "key", type: "text", required: true, unique: true, index: true },
		{ name: "value", type: "number", required: true, defaultValue: 0 },
	],
	timestamps: true,
};
