import type { Field } from "payload";

type AnyField = Field & {
	name?: string;
	type: string;
	fields?: Field[];
	tabs?: Array<{ name?: string; fields: Field[] }>;
};

/**
 * The data-bearing fields of a config, seen through the admin's layout
 * containers. `row`, `collapsible` and unnamed tabs only arrange the form —
 * their children keep their top-level data paths — so a spec asking for a
 * field by name must not care which container the editor put it in. Named
 * groups and named tabs are kept: they ARE a data path segment.
 */
export function dataFields(fields: readonly Field[]): AnyField[] {
	const out: AnyField[] = [];
	for (const raw of fields) {
		const field = raw as AnyField;
		if (field.type === "row" || field.type === "collapsible") {
			out.push(...dataFields(field.fields ?? []));
		} else if (field.type === "tabs") {
			for (const tab of field.tabs ?? []) {
				if (tab.name) {
					out.push({
						type: "group",
						name: tab.name,
						fields: tab.fields,
					} as AnyField);
				} else {
					out.push(...dataFields(tab.fields));
				}
			}
		} else {
			out.push(field);
		}
	}
	return out;
}

/** A field by dotted data path (`refund.sellerProof`), through groups and arrays. */
export function fieldAt(
	fields: readonly Field[],
	path: string,
): AnyField | undefined {
	const [head, ...rest] = path.split(".");
	const found = dataFields(fields).find((f) => f.name === head);
	if (!found || rest.length === 0) return found;
	return fieldAt(found.fields ?? [], rest.join("."));
}
