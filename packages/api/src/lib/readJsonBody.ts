/**
 * A malformed or missing JSON body reads as an empty object; the caller
 * validates whatever fields it needs.
 *
 * Kept dependency-free (no `payload` or `@payload-config` import) so it stays
 * safe to import from anything reachable off a collection's import graph.
 */
export async function readJsonBody(
	request: Request,
): Promise<Record<string, unknown>> {
	try {
		const data = await request.json();
		return data && typeof data === "object"
			? (data as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}
