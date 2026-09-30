// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePayload } from "./helpers/fakePayload";

// vi.hoisted: these fns back mock factories below, which vitest hoists above
// every import in this file (including the route module, which pulls in
// "payload" itself) — plain top-level consts would still be in their
// temporal dead zone when those factories run.
// The mock computes `expiresAt` from the ttl it is actually called with,
// rather than a value hardcoded independently of the call — so a test can
// pin the route's real behaviour (the expiry a caller receives) instead of
// a positional argument on a mock of our own module.
const { createSignedDocumentUrl, getPayloadMock } = vi.hoisted(() => ({
	createSignedDocumentUrl: vi.fn(async (_doc: unknown, ttlSeconds = 60) => ({
		url: "https://signed.example/doc",
		expiresAt: new Date(Date.now() + ttlSeconds * 1000),
	})),
	getPayloadMock: vi.fn(),
}));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));
vi.mock("../../src/lib/privateFiles", () => ({ createSignedDocumentUrl }));

const ROUTE =
	"../../src/app/(frontend)/api/moderation/verification/documents/[docId]/view/route";

function seed() {
	const payload = fakePayload({
		"verification-documents": [
			{
				id: "vd-1",
				request: "vr-1",
				shop: "shop-1",
				kind: "rccm_extract",
				filename: "vd-1.pdf",
				mimeType: "application/pdf",
				purgedAt: null,
			},
		],
		"verification-requests": [
			{
				id: "vr-1",
				shop: "shop-1",
				requestedLevel: 3,
				submittedBy: "seller-1",
				status: "in_review",
				assignee: "m-1",
			},
		],
		"verification-document-views": [],
	});
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

/**
 * The caller's identity comes from `payload.auth`, mocked per test — this
 * only carries the transport-level details (IP, user agent) the route reads
 * off the request itself.
 */
function viewRequest(options: { ip?: string; userAgent?: string } = {}) {
	const headers: Record<string, string> = {};
	if (options.ip) headers["x-forwarded-for"] = options.ip;
	if (options.userAgent) headers["user-agent"] = options.userAgent;
	return new Request(
		"http://x/api/moderation/verification/documents/vd-1/view",
		{ method: "POST", headers },
	);
}

const params = () => ({ params: Promise.resolve({ docId: "vd-1" }) });

beforeEach(() => {
	createSignedDocumentUrl.mockClear();
	createSignedDocumentUrl.mockImplementation(
		async (_doc: unknown, ttlSeconds = 60) => ({
			url: "https://signed.example/doc",
			expiresAt: new Date(Date.now() + ttlSeconds * 1000),
		}),
	);
	process.env.VERIFICATION_HASH_PEPPER = "test-pepper";
});

describe("POST /api/moderation/verification/documents/[docId]/view", () => {
	it("writes the view row before it returns the signed URL", async () => {
		const payload = seed();
		payload.auth.mockResolvedValue({ user: { id: "m-1", role: "moderator" } });
		const order: string[] = [];
		const create = payload.create.bind(payload);
		payload.create = (async (args: Parameters<typeof create>[0]) => {
			order.push(args.collection);
			return create(args);
		}) as typeof payload.create;
		createSignedDocumentUrl.mockImplementation(async () => {
			order.push("signed-url");
			return { url: "https://signed.example/doc", expiresAt: new Date() };
		});

		const { POST } = await import(ROUTE);
		await POST(viewRequest(), params());

		expect(order).toEqual(["verification-document-views", "signed-url"]);
	});

	it("returns no URL at all when the view row cannot be written", async () => {
		const payload = seed();
		payload.auth.mockResolvedValue({ user: { id: "m-1", role: "moderator" } });
		payload.create = (async () => {
			throw new Error("mongo down");
		}) as typeof payload.create;

		const { POST } = await import(ROUTE);
		const response = await POST(viewRequest(), params());

		expect(response.status).toBe(500);
		const body = await response.text();
		expect(body).not.toContain("http");
		expect(createSignedDocumentUrl).not.toHaveBeenCalled();
	});

	it("records the viewer, their role, the hashed IP and a truncated user agent", async () => {
		const payload = seed();
		payload.auth.mockResolvedValue({ user: { id: "m-1", role: "moderator" } });

		const { POST } = await import(ROUTE);
		await POST(
			viewRequest({
				ip: "41.202.1.5",
				userAgent: "M".repeat(400),
			}),
			params(),
		);

		const row = payload.store["verification-document-views"][0];
		expect(row).toMatchObject({
			document: "vd-1",
			request: "vr-1",
			viewer: "m-1",
			viewerRole: "moderator",
		});
		expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
		expect(String(row.ipHash)).not.toContain("41.202");
		expect(String(row.userAgent)).toHaveLength(200);
	});

	it("refuses a moderator who is not the assignee, and lets an admin through", async () => {
		const payload = seed();
		payload.auth.mockResolvedValue({
			user: { id: "m-other", role: "moderator" },
		});
		const { POST } = await import(ROUTE);
		expect((await POST(viewRequest(), params())).status).toBe(403);

		payload.auth.mockResolvedValue({ user: { id: "a-1", role: "admin" } });
		expect((await POST(viewRequest(), params())).status).toBe(200);
	});

	it("returns a URL that expires about 60 seconds out — the window a moderator's browser actually gets", async () => {
		const payload = seed();
		payload.auth.mockResolvedValue({ user: { id: "m-1", role: "moderator" } });

		const before = Date.now();
		const { POST } = await import(ROUTE);
		const response = await POST(viewRequest(), params());
		const body = (await response.json()) as { expiresAt: string };

		const expiresInMs = new Date(body.expiresAt).getTime() - before;
		expect(expiresInMs).toBeGreaterThan(55_000);
		expect(expiresInMs).toBeLessThan(65_000);
	});

	it("refuses a purged document with 404", async () => {
		const payload = seed();
		payload.auth.mockResolvedValue({ user: { id: "m-1", role: "moderator" } });
		const doc = payload.store["verification-documents"][0];
		doc.purgedAt = new Date().toISOString();

		const { POST } = await import(ROUTE);
		expect((await POST(viewRequest(), params())).status).toBe(404);
	});

	it("refuses a non-moderator with 403", async () => {
		const payload = seed();
		payload.auth.mockResolvedValue({ user: { id: "u-1", role: "user" } });

		const { POST } = await import(ROUTE);
		expect((await POST(viewRequest(), params())).status).toBe(403);
	});

	it("ignores the verification feature flag: an in-flight review still finishes while intake is paused", async () => {
		const payload = seed();
		payload.globals["app-settings"] = {
			verification: { enabled: false },
		};
		payload.auth.mockResolvedValue({ user: { id: "m-1", role: "moderator" } });

		const { POST } = await import(ROUTE);
		const response = await POST(viewRequest(), params());

		expect(response.status).toBe(200);
	});
});
