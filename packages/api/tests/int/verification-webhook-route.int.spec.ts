// @vitest-environment node
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePayload } from "./helpers/fakePayload";

process.env.DIDIT_WEBHOOK_SECRET = "whsec-test";
process.env.DIDIT_API_KEY = "key-test";
process.env.DIDIT_WORKFLOW_ID = "wf-1";

// vi.hoisted: getPayloadMock backs the mock factory below, which vitest
// hoists above every import in this file (including the route module, which
// pulls in "payload" itself) — a plain top-level const would still be in its
// temporal dead zone when that factory runs. Follows
// `verification-reviewer-routes.int.spec.ts`'s own pattern.
const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

const ROUTE =
	"../../src/app/(frontend)/api/public/verification/webhook/[provider]/route";

function signed(body: string, secret = "whsec-test") {
	const timestamp = String(Math.floor(Date.now() / 1000));
	return new Headers({
		"x-signature": createHmac("sha256", secret).update(body).digest("hex"),
		"x-timestamp": timestamp,
	});
}

function webhookRequest(body: string) {
	return new Request("http://x/api/public/verification/webhook/didit", {
		method: "POST",
		headers: signed(body),
		body,
	});
}

const params = { params: Promise.resolve({ provider: "didit" }) };

beforeEach(() => {
	getPayloadMock.mockReset();
});

// Generous timeout on both tests: the first `await import(ROUTE)` in this
// file pays the route module's own load cost (the same class of slowness
// `verification-reviewer-routes.int.spec.ts` flags under a busy machine, per
// the P2 final review's I11) — not a sign either test hangs.
const ROUTE_TIMEOUT_MS = 15_000;

describe("didit webhook route (I6)", () => {
	it(
		"stores only the verified subset, never the vendor's raw wire body",
		async () => {
			const payload = fakePayload(
				{},
				{ uniques: { "webhook-events": [["provider", "providerEventId"]] } },
			);
			getPayloadMock.mockResolvedValue(payload);

			// The real shape a didit decision webhook carries: a document number, a
			// name and a birth date riding alongside the three fields
			// `diditWebhookEventSchema` actually reads.
			const body = JSON.stringify({
				session_id: "sess-1",
				status: "Approved",
				webhook_id: "evt-1",
				decision: {
					id_verification: {
						document_number: "AB123456",
						first_name: "Aïcha",
						last_name: "Mbappe",
						date_of_birth: "1990-01-01",
					},
				},
			});

			const { POST } = await import(ROUTE);
			const response = await POST(webhookRequest(body), params);

			expect(response.status).toBe(200);
			expect(payload.store["webhook-events"]).toHaveLength(1);
			const stored = payload.store["webhook-events"][0];
			expect(stored.raw).toEqual({
				providerEventId: "evt-1",
				type: "Approved",
				sessionRef: "sess-1",
			});

			const serialized = JSON.stringify(stored.raw);
			for (const identifying of ["AB123456", "Aïcha", "Mbappe", "1990-01-01"]) {
				expect(serialized).not.toContain(identifying);
			}
		},
		ROUTE_TIMEOUT_MS,
	);

	it(
		"still queues processing and answers 200 on a fresh event",
		async () => {
			const payload = fakePayload(
				{},
				{ uniques: { "webhook-events": [["provider", "providerEventId"]] } },
			);
			getPayloadMock.mockResolvedValue(payload);

			const body = JSON.stringify({
				session_id: "sess-2",
				status: "Approved",
				webhook_id: "evt-2",
			});

			const { POST } = await import(ROUTE);
			const response = await POST(webhookRequest(body), params);

			expect(response.status).toBe(200);
			expect(payload.jobs.queue).toHaveBeenCalledWith(
				expect.objectContaining({
					task: "processKycEvent",
					input: expect.objectContaining({ sessionRef: "sess-2" }),
				}),
			);
		},
		ROUTE_TIMEOUT_MS,
	);
});
