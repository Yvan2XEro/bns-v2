/**
 * Runs once when the production server starts, before it takes traffic, so a
 * deploy needs nobody on the host afterwards:
 *
 * 1. Payload initialises and the job crons start. Without this they waited for
 *    the first request that happened to call `getPayload({ cron: true })`.
 * 2. The boot tasks (database indexes, the market, Novu workflows, category
 *    catch-up) run in the background — see `services/bootTasks.ts`.
 */
export async function register(): Promise<void> {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	if (process.env.NODE_ENV !== "production") return;

	const [{ getPayload }, { default: config }, { runBootTasks }] =
		await Promise.all([
			import("payload"),
			import("./payload.config"),
			import("./services/bootTasks"),
		]);

	let payload: Awaited<ReturnType<typeof getPayload>>;
	try {
		payload = await getPayload({ config, cron: true });
	} catch (error) {
		console.error("[boot] Payload failed to start:", error);
		process.exit(1);
	}

	void runBootTasks(payload).catch((error: unknown) => {
		payload.logger.error({ err: error, msg: "[boot] boot tasks crashed" });
	});
}

/**
 * Errors thrown by route handlers, server components and middleware, filed
 * with Sentry when `SENTRY_DSN` is set. Payload's own API answers its errors
 * itself; those reach Sentry through the `afterError` hook instead.
 */
export async function onRequestError(
	error: unknown,
	request: { path: string; method: string },
	context: { routePath: string; routeType: string },
): Promise<void> {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { reportServerError } = await import("./lib/serverErrors");
	await reportServerError(error, {
		method: request.method,
		route: context.routePath,
		type: context.routeType,
	});
}
