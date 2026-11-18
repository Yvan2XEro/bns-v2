import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PERMANENT_REDIRECTS } from "./redirects";

describe("the permanent redirect map", () => {
	it("pins the one URL move: shop settings into the workspace, 308", () => {
		// Decision 2. Next's redirects() preserves the query string when the
		// destination declares none, so /shop/manage?move=1 keeps working.
		expect(PERMANENT_REDIRECTS).toEqual([
			{
				source: "/shop/manage",
				destination: "/seller/settings",
				permanent: true,
			},
		]);
	});

	it("leaves no root loading boundary: every page lives in a group", () => {
		expect(existsSync(join(import.meta.dir, "../app/loading.tsx"))).toBe(false);
	});
});
