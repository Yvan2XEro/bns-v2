/**
 * A live-database smoke check, NOT part of `bun run test:int`.
 *
 * Every spec under `tests/int/` drives the in-memory Payload fake in
 * `tests/int/helpers/`. This one is the leftover `create-payload-app`
 * scaffold: it boots a real Payload against whatever `DATABASE_URI` points
 * at, which in this repo is a live Atlas cluster. So running it as part of
 * the normal suite reaches out to a cloud database, and it failed for
 * everyone without one — which is how it came to be quoted in AGENTS.md as
 * the project's one "pre-existing failure" and used to excuse five other
 * files that were never broken.
 *
 * It is kept because a "can we actually connect and read" check has value
 * before a deploy. Run it deliberately:
 *
 *   cd packages/api && bunx vitest run --config ./vitest.config.mts \
 *     --dir tests/smoke
 *
 * It asserts only that a `find` resolves, so treat a pass as "the database
 * answers", nothing more.
 */
import { getPayload, type Payload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../../src/payload.config";

let payload: Payload;

describe("API", () => {
	beforeAll(async () => {
		const payloadConfig = await config;
		payload = await getPayload({ config: payloadConfig });
	});

	it("fetches users", async () => {
		const users = await payload.find({
			collection: "users",
		});
		expect(users).toBeDefined();
	});
});
