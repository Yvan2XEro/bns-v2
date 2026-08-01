import config from "@payload-config";
import { getPayload } from "payload";

// Prerendered otherwise, which meant tags created after a deploy never showed
// up in the clients until the next build.
export const dynamic = "force-dynamic";

export async function GET() {
	const payload = await getPayload({ config });
	// biome-ignore lint/suspicious/noExplicitAny: tags collection not yet in generated types
	const result = await (payload as any).find({
		collection: "tags",
		limit: 100,
		sort: "name",
	});
	return Response.json(result.docs);
}
