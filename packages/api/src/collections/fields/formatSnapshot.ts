import type { ArrayField } from "payload";

const select = (name: string, values: string[]) => ({
	name,
	type: "select" as const,
	required: true,
	options: values.map((value) => ({ label: value, value })),
});

/** The market's formatting rows frozen at issue time; mirrors `MoneyFormat`. */
export const formatSnapshotField: ArrayField = {
	name: "formatSnapshot",
	type: "array",
	admin: { readOnly: true },
	fields: [
		select("locale", ["fr", "en"]),
		{ name: "symbol", type: "text", required: true },
		select("position", ["before", "after"]),
		{ name: "groupSeparator", type: "text", required: true },
		{ name: "decimalSeparator", type: "text", required: true },
		{ name: "minorUnit", type: "number", required: true, min: 0, max: 3 },
	],
};

export const marketField = {
	name: "market",
	type: "relationship" as const,
	relationTo: "markets" as const,
	index: true,
};
