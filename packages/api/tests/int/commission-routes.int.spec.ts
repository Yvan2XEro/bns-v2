// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, getPayloadMock, services, guards } = vi.hoisted(() => {
	const auth = vi.fn();
	return {
		auth,
		getPayloadMock: vi.fn(async () => ({ auth, findByID: vi.fn() })),
		services: {
			payInvoice: vi.fn(),
			getBillingView: vi.fn(),
			resolveInvoiceLineViews: vi.fn(),
		},
		guards: { requireShopPermission: vi.fn() },
	};
});

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));
vi.mock("../../src/services/commission", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/services/commission")>()),
	payInvoice: services.payInvoice,
	getBillingView: services.getBillingView,
	resolveInvoiceLineViews: services.resolveInvoiceLineViews,
}));
vi.mock("../../src/services/shopGuards", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/services/shopGuards")>()),
	requireShopPermission: guards.requireShopPermission,
}));

import { ERROR_CODES } from "../../src/lib/errors";
import { ServiceError } from "../../src/lib/serviceError";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (url: string) => new Request(url, { method: "POST" });

beforeEach(() => {
	for (const fn of Object.values(services)) fn.mockReset();
	guards.requireShopPermission.mockReset();
	auth.mockReset();
	auth.mockResolvedValue({ user: { id: "u-1", role: "user" } });
});

describe("POST /api/commission-invoices/[id]/pay", () => {
	it("answers 401 without a session", async () => {
		auth.mockResolvedValue({ user: null });
		const { POST } = await import(
			"../../src/app/(frontend)/api/commission-invoices/[id]/pay/route"
		);
		const res = await POST(
			post("http://x/api/commission-invoices/inv-1/pay"),
			params("inv-1"),
		);
		expect(res.status).toBe(401);
		expect(services.payInvoice).not.toHaveBeenCalled();
	});

	it("returns the checkout url on success", async () => {
		services.payInvoice.mockResolvedValue({
			checkoutUrl: "https://pay.test/c-1",
		});
		const { POST } = await import(
			"../../src/app/(frontend)/api/commission-invoices/[id]/pay/route"
		);
		const res = await POST(
			post("http://x/api/commission-invoices/inv-1/pay"),
			params("inv-1"),
		);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ checkoutUrl: "https://pay.test/c-1" });
		expect(services.payInvoice).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ id: "u-1" }),
			"inv-1",
		);
	});

	it("maps commission.alreadyPaid to 409", async () => {
		services.payInvoice.mockRejectedValue(
			new ServiceError(ERROR_CODES.commissionAlreadyPaid, 409),
		);
		const { POST } = await import(
			"../../src/app/(frontend)/api/commission-invoices/[id]/pay/route"
		);
		const res = await POST(
			post("http://x/api/commission-invoices/inv-1/pay"),
			params("inv-1"),
		);

		expect(res.status).toBe(409);
		expect((await res.json()).code).toBe(ERROR_CODES.commissionAlreadyPaid);
	});

	it("maps shop.forbidden to 403 (a staff member — payments.view is owner/manager)", async () => {
		services.payInvoice.mockRejectedValue(
			new ServiceError(ERROR_CODES.shopForbidden, 403),
		);
		const { POST } = await import(
			"../../src/app/(frontend)/api/commission-invoices/[id]/pay/route"
		);
		const res = await POST(
			post("http://x/api/commission-invoices/inv-1/pay"),
			params("inv-1"),
		);

		expect(res.status).toBe(403);
	});
});

describe("GET /api/shops/[id]/billing", () => {
	it("answers 401 without a session", async () => {
		auth.mockResolvedValue({ user: null });
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/billing/route"
		);
		const res = await GET(
			new Request("http://x/api/shops/s-1/billing"),
			params("s-1"),
		);
		expect(res.status).toBe(401);
	});

	it("returns the billing view", async () => {
		const view = {
			invoices: [],
			currentPeriod: {
				periodStart: "x",
				periodEnd: "y",
				accrued: 0,
				ordersCount: 0,
			},
			restricted: null,
		};
		services.getBillingView.mockResolvedValue(view);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/billing/route"
		);
		const res = await GET(
			new Request("http://x/api/shops/s-1/billing"),
			params("s-1"),
		);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(view);
	});

	it("maps shop.notMember to 403", async () => {
		services.getBillingView.mockRejectedValue(
			new ServiceError(ERROR_CODES.shopNotMember, 403),
		);
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/billing/route"
		);
		const res = await GET(
			new Request("http://x/api/shops/s-1/billing"),
			params("s-1"),
		);
		expect(res.status).toBe(403);
	});
});

describe("GET /api/commission-invoices/[id]/document", () => {
	it("answers 401 without a session", async () => {
		auth.mockResolvedValue({ user: null });
		const { GET } = await import(
			"../../src/app/(frontend)/api/commission-invoices/[id]/document/route"
		);
		const res = await GET(
			new Request("http://x/api/commission-invoices/inv-1/document"),
			params("inv-1"),
		);
		expect(res.status).toBe(401);
	});

	it("answers 404 when the invoice does not exist", async () => {
		getPayloadMock.mockResolvedValue({
			auth,
			findByID: vi.fn(async () => {
				throw new Error("not found");
			}),
		});
		const { GET } = await import(
			"../../src/app/(frontend)/api/commission-invoices/[id]/document/route"
		);
		const res = await GET(
			new Request("http://x/api/commission-invoices/inv-1/document"),
			params("inv-1"),
		);
		expect(res.status).toBe(404);
		expect((await res.json()).code).toBe(ERROR_CODES.commissionInvoiceNotFound);
	});

	it("renders the html document in the requested language", async () => {
		getPayloadMock.mockResolvedValue({
			auth,
			findByID: vi.fn(async () => ({
				id: "inv-1",
				invoiceNumber: "BNS-C-2026-000001",
				shop: "s-1",
				periodStart: "2026-09-14T00:00:00.000Z",
				periodEnd: "2026-09-20T23:59:59.999Z",
				issuedAt: "2026-09-21T00:00:00.000Z",
				dueAt: "2026-09-28T00:00:00.000Z",
				commissionTotal: 3_600,
				vatAmount: 693,
				totalDue: 4_293,
				sellerSnapshot: { name: "Shop" },
				issuerSnapshot: { legalName: "BuyNSellem SARL" },
			})),
		});
		guards.requireShopPermission.mockResolvedValue({
			shop: { id: "s-1" },
			role: "owner",
		});
		services.resolveInvoiceLineViews.mockResolvedValue([
			{
				orderNumber: "BNS-2609-000001",
				baseAmount: 45_000,
				amount: 3_600,
				kind: "charge",
			},
		]);

		const { GET } = await import(
			"../../src/app/(frontend)/api/commission-invoices/[id]/document/route"
		);
		const res = await GET(
			new Request("http://x/api/commission-invoices/inv-1/document?lang=en"),
			params("inv-1"),
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const html = await res.text();
		expect(html).toContain("Commission invoice");
		expect(html).toContain("BNS-2609-000001");
	});
});
