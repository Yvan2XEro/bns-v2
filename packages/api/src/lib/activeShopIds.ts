import type { Payload } from "payload";

/**
 * Live insurance behind the search index: a lost `search:index` Redis
 * publish (indexer down, a Redis blip, a crash between commit and publish —
 * `hooks/searchEvents.ts` drops a failed publish with no retry) can leave a
 * suspended, closed or renamed shop's name/handle/level cached in a
 * Meilisearch document indefinitely, since nothing else corrects it. One
 * query per page of hits — never per hit — and skipped entirely when the
 * page carries no shop ids.
 */
export async function activeShopIds(
	payload: Payload,
	shopIds: string[],
): Promise<Set<string>> {
	if (shopIds.length === 0) return new Set();
	const result = await payload.find({
		collection: "shops",
		where: { and: [{ id: { in: shopIds } }, { status: { equals: "active" } }] },
		depth: 0,
		limit: 0,
		pagination: false,
	});
	return new Set(result.docs.map((doc) => String(doc.id)));
}
