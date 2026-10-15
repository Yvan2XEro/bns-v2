import config from "@payload-config";
import { getPayload } from "payload";
import { tagsForCategory } from "@/lib/categoryTags";

/**
 * The tags a listing filed under `?category=` may carry: those scoped to the
 * category or one of its ancestors. Without a category there is nothing a tag
 * could apply to, so the answer is empty.
 */
export async function GET(request: Request) {
	const category = new URL(request.url).searchParams.get("category");
	if (!category || !/^[a-zA-Z0-9_-]{1,64}$/.test(category)) {
		return Response.json([]);
	}
	const payload = await getPayload({ config });
	const tags = await tagsForCategory(payload, category);
	return Response.json(
		tags.map(({ id, name, slug, emoji }) => ({ id, name, slug, emoji })),
	);
}
