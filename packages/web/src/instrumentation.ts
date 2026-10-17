/**
 * Errors thrown while rendering pages, route handlers and middleware, filed
 * with Sentry when the API's config names a web DSN.
 */
export async function onRequestError(
	error: unknown,
	request: { path: string; method: string },
	context: { routePath: string; routeType: string },
): Promise<void> {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { reportServerError } = await import("./lib/server-errors");
	await reportServerError(error, {
		method: request.method,
		route: context.routePath,
		type: context.routeType,
	});
}
