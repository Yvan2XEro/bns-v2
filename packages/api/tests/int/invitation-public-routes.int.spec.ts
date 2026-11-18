// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import { ServiceError } from "../../src/lib/serviceError";

// vi.hoisted: this backs the "payload" factory below, which vitest hoists
// above every import in this file — including the `ServiceError` import
// above, which pulls in the real "payload" package for `APIError` and so
// forces it to resolve before this file's own top-level code runs. A plain
// top-level const would still be in its temporal dead zone at that point.
const { getPayloadMock } = vi.hoisted(() => ({
	getPayloadMock: vi.fn(async () => ({})),
}));

// The lookup and decline routes build their own `Payload` through
// `getPayload({ config })` (they have no caller to authenticate, so they
// cannot go through `requireUser`). Both of those stay mocked below so this
// spec never opens a real MongoDB connection; the resulting instance is
// never inspected, since `lookupInvitation`/`declineInvitation` are mocked
// too and only its identity (not its shape) is asserted on.
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

const ctx = {
	payload: {} as never,
	user: {
		id: "u-invitee",
		role: "user",
		name: null,
		suspendedAt: null,
		suspendedUntil: null,
	},
};

// Mocked by their relative path, not the "@/..." alias: vite-tsconfig-paths
// resolves the alias used inside a route file to the real module id, but a
// `vi.mock("@/...")` call made from this test file does not consistently
// resolve to that same id and silently fails to intercept (confirmed against
// the repo's other route specs, e.g. inbox-routes.int.spec.ts and
// shop-routes.int.spec.ts, all of which mock by relative path for this
// reason).
const requireUserMock = vi.fn(async () => ctx);
vi.mock("../../src/lib/shopRoute", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/lib/shopRoute")>()),
	requireUser: requireUserMock,
}));

const store = new MemoryCounterStore(() =>
	Date.parse("2026-10-01T10:00:00.000Z"),
);
vi.mock("../../src/lib/rateLimit", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/lib/rateLimit")>()),
	getCounterStore: () => store,
}));

const service = {
	lookupInvitation: vi.fn(async () => ({ role: "staff", status: "pending" })),
	acceptInvitation: vi.fn(async () => ({ shopId: "s-1", role: "staff" })),
	declineInvitation: vi.fn(async () => ({ declined: true })),
};
vi.mock("../../src/services/shopMembers", () => service);

const params = (token: string) => ({ params: Promise.resolve({ token }) });
const from = (ip: string) =>
	new Request("http://localhost/x", { headers: { "x-forwarded-for": ip } });

beforeEach(() => {
	vi.clearAllMocks();
});

const FULL_VIEW = {
	shop: {
		name: "Akwa Tech",
		handle: "akwatech",
		logoUrl: null,
		badge: "identity" as const,
	},
	role: "staff" as const,
	channel: "phone" as const,
	maskedTarget: "+237•••••00",
	inviterFirstName: "Aïcha",
	expiresAt: "2026-10-08T00:00:00.000Z",
	status: "pending" as const,
};

describe("GET /api/public/invitations/{token}", () => {
	it("answers without authentication", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/invitations/[token]/route"
		);
		const response = await GET(from("1.1.1.1"), params("tok"));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ role: "staff" });
	});

	it("answers with exactly the public invitation view's keys — nothing a stranger with a guessed token should not see", async () => {
		service.lookupInvitation.mockResolvedValueOnce(FULL_VIEW);
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/invitations/[token]/route"
		);
		const response = await GET(from("6.6.6.6"), params("tok"));
		const body = (await response.json()) as Record<string, unknown>;
		// Exact key sets, not a subset match: a field added to the route later
		// (the shop id, the inviter's email, a member list) would slip past
		// `toMatchObject` but fails this.
		expect(Object.keys(body).sort()).toEqual(
			[
				"shop",
				"role",
				"channel",
				"maskedTarget",
				"inviterFirstName",
				"expiresAt",
				"status",
			].sort(),
		);
		expect(Object.keys(body.shop as Record<string, unknown>).sort()).toEqual(
			["name", "handle", "logoUrl", "badge"].sort(),
		);
	});

	it("declares thirty lookups per IP per hour and refuses the thirty-first", async () => {
		const mod = await import(
			"../../src/app/(frontend)/api/public/invitations/[token]/route"
		);
		expect(mod.INVITATION_LOOKUP_LIMITS).toEqual([
			{ name: "invitation-lookup:hour", limit: 30, windowSeconds: 3600 },
		]);
		for (let i = 0; i < 30; i++) {
			expect((await mod.GET(from("2.2.2.2"), params("tok"))).status).toBe(200);
		}
		const blocked = await mod.GET(from("2.2.2.2"), params("tok"));
		expect(blocked.status).toBe(429);
		expect(await blocked.json()).toMatchObject({ code: "generic.rateLimited" });
		// Another IP is unaffected: the bucket is per address.
		expect((await mod.GET(from("3.3.3.3"), params("tok"))).status).toBe(200);
	});

	it("counts the call before the lookup, so a guesser cannot enumerate cheaply", async () => {
		const mod = await import(
			"../../src/app/(frontend)/api/public/invitations/[token]/route"
		);
		// A genuine `ServiceError` instance, not a plain object shaped like one:
		// `handleServiceError` matches on `instanceof`, so a duck-typed error
		// would fall through to generic.server and miscount what this test
		// means to prove.
		service.lookupInvitation.mockRejectedValueOnce(
			new ServiceError("team.invitationInvalid", 404),
		);
		const first = await mod.GET(from("4.4.4.4"), params("bad"));
		expect(first.status).toBe(404);
		for (let i = 0; i < 29; i++) await mod.GET(from("4.4.4.4"), params("bad"));
		expect((await mod.GET(from("4.4.4.4"), params("bad"))).status).toBe(429);
	});

	it("refuses an absurdly long token before hashing it", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/public/invitations/[token]/route"
		);
		const response = await GET(from("5.5.5.5"), params("x".repeat(500)));
		expect(response.status).toBe(400);
		expect(service.lookupInvitation).not.toHaveBeenCalled();
	});
});

describe("POST /api/invitations/{token}/accept", () => {
	it("requires authentication and passes the caller through", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/invitations/[token]/accept/route"
		);
		const response = await POST(
			new Request("http://localhost/x", { method: "POST" }),
			params("tok"),
		);
		expect(response.status).toBe(200);
		expect(service.acceptInvitation).toHaveBeenCalledWith(
			ctx.payload,
			ctx.user,
			"tok",
		);
		expect(requireUserMock).toHaveBeenCalled();
	});
});

describe("POST /api/invitations/{token}/decline", () => {
	it("answers without authentication", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/invitations/[token]/decline/route"
		);
		const response = await POST(
			new Request("http://localhost/x", { method: "POST" }),
			params("tok"),
		);
		expect(response.status).toBe(200);
		// The route has no `requireUser`, so it builds its own payload through
		// `getPayload({ config })`; the caller identity is the token itself.
		expect(service.declineInvitation).toHaveBeenCalledWith(
			expect.anything(),
			"tok",
		);
		// The asymmetry with accept is deliberate: decline must never touch
		// `requireUser`, on a request that carries no credentials at all.
		expect(requireUserMock).not.toHaveBeenCalled();
	});

	it("answers a token that never existed, one that expired and one already answered identically", async () => {
		// `declineInvitation` (Task 9) throws the same `team.invitationInvalid`
		// at 409 whether the row is missing, expired or already settled — the
		// route must forward that without adding anything that would let an
		// anonymous caller (decline has no auth) tell the three apart by
		// probing guessed tokens.
		const { POST } = await import(
			"../../src/app/(frontend)/api/invitations/[token]/decline/route"
		);
		const causes = ["unknown-token", "expired-token", "already-answered-token"];
		const responses = await Promise.all(
			causes.map(async (reason) => {
				service.declineInvitation.mockRejectedValueOnce(
					new ServiceError("team.invitationInvalid", 409, reason),
				);
				const response = await POST(
					new Request("http://localhost/x", { method: "POST" }),
					params(reason),
				);
				return { status: response.status, body: await response.json() };
			}),
		);
		for (const { status, body } of responses) {
			expect(status).toBe(409);
			// The code a client branches on, not the message: `ServiceError`'s
			// constructor only uses `reason` as the `Error.message` for logs,
			// never serialised into the response body.
			expect(body).toEqual({
				code: "team.invitationInvalid",
				message: expect.any(String),
			});
		}
		const [first, ...rest] = responses;
		for (const response of rest) {
			expect(response).toEqual(first);
		}
	});
});
