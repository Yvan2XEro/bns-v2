import type { Payload, PayloadRequest } from "payload";
import type { Tag } from "../payload-types";
import { relationId } from "./relationId";

/** Same cap as the form preset's ancestor walk. */
const MAX_DEPTH = 32;

/**
 * The category and its ancestors, nearest first. One depth-0 read per level,
 * stopping on a missing parent or a cycle, so the result never depends on how
 * deep a caller happened to populate the category.
 */
export async function categoryChainIds(
	payload: Payload,
	categoryId: string,
	req?: PayloadRequest,
): Promise<string[]> {
	const chain: string[] = [];
	let current: string | null = categoryId;
	while (current && !chain.includes(current) && chain.length < MAX_DEPTH) {
		const category = await payload
			.findByID({
				collection: "categories",
				id: current,
				depth: 0,
				overrideAccess: true,
				...(req ? { req } : {}),
			})
			.catch(() => null);
		if (!category) break;
		chain.push(current);
		current = relationId(category.parent);
	}
	return chain;
}

/** Every tag that applies to the category, sorted by name. */
export async function tagsForCategory(
	payload: Payload,
	categoryId: string,
	req?: PayloadRequest,
): Promise<Tag[]> {
	const chain = await categoryChainIds(payload, categoryId, req);
	if (chain.length === 0) return [];
	const result = await payload.find({
		collection: "tags",
		where: { categories: { in: chain } },
		depth: 0,
		limit: 0,
		pagination: false,
		sort: "name",
		overrideAccess: true,
		...(req ? { req } : {}),
	});
	return result.docs;
}
