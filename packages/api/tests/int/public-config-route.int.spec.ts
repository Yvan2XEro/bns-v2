// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const findGlobal = vi.fn();
vi.mock("@payload-config", () => ({ default: {} }));
// The alias above does not resolve to the same module id as the real
// `import config from "@payload-config"` in route.ts inside this test's
// module graph, so it never intercepts on its own; mock the concrete file
// too (same workaround as public-search-route.int.spec.ts). Without it, the
// real payload.config.ts loads every collection, which is slow enough alone
// to brush the default 5s test timeout under full-suite parallel load.
vi.mock("../../src/payload.config.ts", () => ({ default: {} }));
// A plain factory, not `...(await importOriginal())`: the route only ever
// touches `getPayload`, and with the real config genuinely out of the graph
// above, nothing else needs a real export from "payload".
vi.mock("payload", () => ({
	getPayload: vi.fn(async () => ({ findGlobal })),
}));

describe("GET /api/public/config", () => {
	// A block body, not `() => findGlobal.mockReset()`: mockReset() returns the
	// mock itself, and vitest treats a function RETURNED from beforeEach as a
	// teardown callback, invoking findGlobal() again after each test — with
	// whatever implementation the test left behind, surfacing as a phantom
	// rejection on the "keeps shops off" case.
	beforeEach(() => {
		findGlobal.mockReset();
	});

	it("exposes shopsEnabled from the settings", async () => {
		findGlobal.mockResolvedValue({ shops: { enabled: true, maxPerUser: 1 } });
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/config/route"
		);
		expect(await (await GET()).json()).toMatchObject({ shopsEnabled: true });
	});

	it("keeps shops off when the settings cannot be read", async () => {
		findGlobal.mockRejectedValue(new Error("down"));
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/config/route"
		);
		expect(await (await GET()).json()).toMatchObject({ shopsEnabled: false });
	});
});
