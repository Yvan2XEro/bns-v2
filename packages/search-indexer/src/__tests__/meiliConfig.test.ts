import { describe, expect, test } from "bun:test";
import { resolveMeiliConfig } from "../meilisearch.ts";

describe("resolveMeiliConfig", () => {
	test("reads the names the API uses", () => {
		expect(
			resolveMeiliConfig({
				MEILI_HOST: "http://meili:7700",
				MEILI_MASTER_KEY: "k",
			}),
		).toEqual({ host: "http://meili:7700", apiKey: "k" });
	});

	test("falls back to the old names for one release", () => {
		expect(
			resolveMeiliConfig({
				MEILISEARCH_HOST: "http://old:7700",
				MEILISEARCH_API_KEY: "old",
			}),
		).toEqual({ host: "http://old:7700", apiKey: "old" });
	});

	test("prefers the new names when both are set", () => {
		expect(
			resolveMeiliConfig({
				MEILI_HOST: "http://new:7700",
				MEILISEARCH_HOST: "http://old:7700",
				MEILI_MASTER_KEY: "new",
				MEILISEARCH_API_KEY: "old",
			}),
		).toEqual({ host: "http://new:7700", apiKey: "new" });
	});

	test("defaults to a local instance", () => {
		expect(resolveMeiliConfig({})).toEqual({
			host: "http://localhost:7700",
			apiKey: "",
		});
	});
});
