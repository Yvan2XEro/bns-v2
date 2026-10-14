/**
 * Runs once when the production server starts, before it takes traffic, so a
 * deploy needs nobody on the host afterwards:
 *
 * 1. Payload initialises: pending migrations (`prodMigrations`) are applied
 *    and the job crons start. Without this both waited for the first request
 *    that happened to call `getPayload({ cron: true })`.
 * 2. The boot tasks (Novu workflows, category catch-up, backfills) run in the
 *    background — see `services/bootTasks.ts`.
 *
 * A migration that fails exits the process: a release never serves from a
 * half-migrated database, and the container restarts into the same error
 * until it is fixed, loudly, in `docker compose logs api`.
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
