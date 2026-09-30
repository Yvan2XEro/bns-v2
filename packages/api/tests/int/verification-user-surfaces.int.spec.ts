// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { getMyShop, resolvePublicShop } from "../../src/services/shops";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-09-15T12:00:00.000Z");
const FUTURE = "2027-09-01T00:00:00.000Z";

function seed() {
	return fakePayload({
		users: [
			{
				id: "u-1",
				name: "Aïcha",
				email: "aicha@example.com",
				role: "user",
				identityVerifiedAt: "2026-09-01T00:00:00.000Z",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
			{
				id: "u-2",
				name: "Suspended owner",
				email: "sus@example.com",
				role: "user",
				identityVerifiedAt: "2026-08-01T00:00:00.000Z",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
			{
				id: "u-3",
				name: "No shop",
				email: "noshop@example.com",
				role: "user",
				identityVerifiedAt: null,
				createdAt: "2026-01-01T00:00:00.000Z",
			},
			{
				id: "m-1",
				name: "Mod",
				email: "mod@example.com",
				role: "moderator",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
		],
		shops: [
			{
				id: "s-1",
				handle: "akwatech",
				name: "Akwa Tech",
				owner: "u-1",
				status: "active",
				level: 2,
				levelExpiresAt: FUTURE,
				publishedListingCount: 0,
			},
			{
				id: "s-2",
				handle: "badshop",
				name: "Bad Shop",
				owner: "u-2",
				status: "suspended",
				level: 2,
				levelExpiresAt: FUTURE,
				publishedListingCount: 0,
			},
		],
		"shop-members": [
			{ id: "sm-1", shop: "s-1", user: "u-1", role: "owner", status: "active" },
		],
		listings: [],
		reports: [],
		"moderation-log": [],
	});
}

// The route imports `payload` and `@payload-config` at module scope
// (through `requireModerator`), so both are mocked before the route module
// itself is imported.
const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

const ROUTE = "../../src/app/(frontend)/api/moderation/users/[id]/route";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = () =>
	new Request("http://x/api/moderation/users/u-1", { method: "GET" });

describe("GET /api/moderation/users/{id}", () => {
	it("reports the identity date and the owned shop's badge, not a checkbox", async () => {
		const payload = seed();
		getPayloadMock.mockResolvedValue(payload);
		payload.auth.mockResolvedValue({ user: { id: "m-1", role: "moderator" } });
		const { GET } = await import(ROUTE);

		const body = await (await GET(request(), params("u-1"))).json();

		expect(body.user).toMatchObject({
			identityVerifiedAt: "2026-09-01T00:00:00.000Z",
		});
		expect(body.user).not.toHaveProperty("verified");
		expect(body).not.toHaveProperty("verified");
		expect(body.shopBadge).toBe("identity");
	});

	it("reports no badge for an owner whose shop is suspended", async () => {
		const payload = seed();
		getPayloadMock.mockResolvedValue(payload);
		payload.auth.mockResolvedValue({ user: { id: "m-1", role: "moderator" } });
		const { GET } = await import(ROUTE);

		const body = await (await GET(request(), params("u-2"))).json();

		expect(body.shopBadge).toBeNull();
	});

	it("reports no badge for a user who owns no shop", async () => {
		const payload = seed();
		getPayloadMock.mockResolvedValue(payload);
		payload.auth.mockResolvedValue({ user: { id: "m-1", role: "moderator" } });
		const { GET } = await import(ROUTE);

		const body = await (await GET(request(), params("u-3"))).json();

		expect(body.shopBadge).toBeNull();
		expect(body.user.identityVerifiedAt).toBeNull();
	});
});

describe("shop responses", () => {
	it("carries capabilities on the manage response so no client recomputes them", async () => {
		const body = await getMyShop(seed(), { id: "u-1" }, NOW);
		expect(body.shop?.capabilities).toMatchObject({
			effectiveLevel: 2,
			badge: "identity",
			teamMembers: true,
			maxMembers: 5,
		});
	});

	it("carries capabilities on resolvePublicShop's manage variant", async () => {
		const result = await resolvePublicShop(seed(), "akwatech", NOW, {
			manage: true,
		});
		expect(
			result && "shop" in result ? result.shop.capabilities : null,
		).toMatchObject({
			effectiveLevel: 2,
			badge: "identity",
			teamMembers: true,
			maxMembers: 5,
		});
	});

	it("carries level and badge but no capability flags on the public lookup", async () => {
		const result = await resolvePublicShop(seed(), "akwatech", NOW);
		expect(result).toMatchObject({ shop: { level: 2, badge: "identity" } });
		if (result && "shop" in result) {
			expect(result.shop).not.toHaveProperty("capabilities");
		}
	});

	it("reports badge null and level-0 capabilities for a suspended shop's manage response", async () => {
		const result = await resolvePublicShop(seed(), "badshop", NOW, {
			manage: true,
		});
		expect(result && "shop" in result ? result.shop : null).toMatchObject({
			badge: null,
			capabilities: { effectiveLevel: 0, badge: null },
		});
	});

	it("still hides a suspended shop from the public lookup", async () => {
		expect(await resolvePublicShop(seed(), "badshop", NOW)).toBeNull();
	});
});

describe("admin panel surfaces", () => {
	const read = (path: string) =>
		readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

	it("no longer queries users by the retired verified field", () => {
		const source = read("src/components/widgets/ModerationWidget.tsx");
		expect(source).not.toContain("where[verified]");
		expect(source).toContain("pendingVerifications");
	});

	it("no longer offers a Verify button", () => {
		expect(read("src/components/views/UserActions.tsx")).not.toMatch(
			/Unverify|\bVerify\b/,
		);
	});

	it("shows identity verification instead of the retired checkbox", () => {
		const source = read("src/components/views/UserManagementClient.tsx");
		expect(source).not.toMatch(/u\.verified/);
		expect(source).toContain("identityVerifiedAt");
		expect(source).toContain("Identity verified");
	});
});
