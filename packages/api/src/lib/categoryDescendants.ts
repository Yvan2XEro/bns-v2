import type { Payload } from "payload";
import { relationId } from "./relationId";

/**
 * A category and every category under it, so filtering on a parent also
 * matches what is filed in its subcategories.
 */
export async function categoryWithDescendants(
	payload: Payload,
	categoryId: string,
): Promise<string[]> {
	const result = await payload.find({
		collection: "categories",
		select: { parent: true },
		depth: 0,
		limit: 0,
		pagination: false,
	});
	const children = new Map<string, string[]>();
	for (const doc of result?.docs ?? []) {
		const parent = relationId((doc as { parent?: unknown }).parent);
		if (!parent) continue;
		children.set(parent, [...(children.get(parent) ?? []), String(doc.id)]);
	}
	const ids = [categoryId];
	for (let i = 0; i < ids.length; i++) {
		for (const child of children.get(ids[i]) ?? []) {
			if (!ids.includes(child)) ids.push(child);
		}
	}
	return ids;
}
