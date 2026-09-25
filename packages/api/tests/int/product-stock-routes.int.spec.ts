// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: these fns back mock factories below, which vitest hoists above
// every import in this file (including the route modules, which pull in
// "payload" itself) — plain top-level consts would still be in their
// temporal dead zone when those factories run.
const { auth, getPayloadMock, services } = vi.hoisted(() => {
	const auth = vi.fn();
	return {
		auth,
		getPayloadMock: vi.fn(async () => ({ auth })),
		services: {
			createProduct: vi.fn(),
			updateProduct: vi.fn(),
			listCatalogue: vi.fn(),
			getProductDetail: vi.fn(),
			recordMovement: vi.fn(),
			recordStockCount: vi.fn(),
			listMovements: vi.fn(),
			stockSummary: vi.fn(),
			getMyShop: vi.fn(),
		},
	};
});

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
	addDataAndFileToRequest: vi.fn(async () => undefined),
}));
// Spread importOriginal: the routes' zod schemas reference the real
// PRODUCT_STATUSES / CLIENT_MOVEMENT_TYPES enums, which a bare replacement
// mock would otherwise leave undefined.
vi.mock("../../src/services/products", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/services/products")>()),
	createProduct: services.createProduct,
	updateProduct: services.updateProduct,
}));
vi.mock("../../src/services/catalogue", () => ({
	listCatalogue: services.listCatalogue,
	getProductDetail: services.getProductDetail,
}));
vi.mock("../../src/services/stock", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/services/stock")>()),
	recordMovement: services.recordMovement,
	recordStockCount: services.recordStockCount,
	listMovements: services.listMovements,
	stockSummary: services.stockSummary,
}));
vi.mock("../../src/services/shops", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/services/shops")>()),
	getMyShop: services.getMyShop,
}));

import { ServiceError } from "../../src/lib/serviceError";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (url: string, body: unknown) =>
	new Request(url, {
		method: "POST",
		body: JSON.stringify(body),
		headers: { "content-type": "application/json" },
	});

beforeEach(() => {
	for (const fn of Object.values(services)) fn.mockReset();
	auth.mockResolvedValue({ user: { id: "u-1", role: "user" } });
});

describe("shop routes require a user", () => {
	it("answers 401 without a session", async () => {
		auth.mockResolvedValue({ user: null });
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/mine/route"
		);
		expect((await GET(new Request("http://x/api/shops/mine"))).status).toBe(
			401,
		);
	});
});

describe("GET /api/shops/mine", () => {
	it("returns the summary", async () => {
		services.getMyShop.mockResolvedValue({
			shop: null,
			role: null,
			counts: null,
		});
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/mine/route"
		);
		expect(
			await (await GET(new Request("http://x/api/shops/mine"))).json(),
		).toEqual({ shop: null, role: null, counts: null });
	});
});

describe("products", () => {
	it("creates a product with 201", async () => {
		services.createProduct.mockResolvedValue({
			product: { id: "p-1" },
			variants: [],
		});
		const { POST } = await import(
			"../../src/app/(frontend)/api/shops/[id]/products/route"
		);
		const res = await POST(
			post("http://x/api/shops/s-1/products", { title: "X" }),
			params("s-1"),
		);
		expect(res.status).toBe(201);
		expect(services.createProduct).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ id: "u-1" }),
			"s-1",
			{ title: "X" },
		);
	});

	it("passes catalogue filters through", async () => {
		services.listCatalogue.mockResolvedValue({ docs: [] });
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/products/route"
		);
		await GET(
			new Request(
				"http://x/api/shops/s-1/products?status=draft&stock=low&q=ip&page=2&limit=10",
			),
			params("s-1"),
		);
		expect(services.listCatalogue).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			"s-1",
			{ status: "draft", stock: "low", q: "ip", page: 2, limit: 10 },
		);
	});

	it("rejects an unknown stock filter before calling the service", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/products/route"
		);
		const res = await GET(
			new Request("http://x/api/shops/s-1/products?stock=negative"),
			params("s-1"),
		);
		expect(res.status).toBe(400);
		expect(services.listCatalogue).not.toHaveBeenCalled();
	});

	it("updates through the Payload endpoint", async () => {
		services.updateProduct.mockResolvedValue({
			product: { id: "p-1" },
			variants: [],
		});
		const { updateProductEndpoint } = await import(
			"../../src/endpoints/products"
		);
		const res = await updateProductEndpoint.handler({
			user: { id: "u-1" },
			payload: {},
			routeParams: { id: "p-1" },
			data: { title: "Y" },
		} as never);
		expect(res.status).toBe(200);
		expect(services.updateProduct).toHaveBeenCalledWith(
			{},
			expect.objectContaining({ id: "u-1" }),
			"p-1",
			{ title: "Y" },
		);
	});
});

describe("GET /api/products/[id]/detail", () => {
	it("returns the shaped detail", async () => {
		services.getProductDetail.mockResolvedValue({
			product: { id: "p-1" },
			variants: [],
			listing: null,
			movements: [],
			role: "owner",
		});
		const { GET } = await import(
			"../../src/app/(frontend)/api/products/[id]/detail/route"
		);
		const res = await GET(new Request("http://x/api/products/p-1/detail"), {
			params: Promise.resolve({ id: "p-1" }),
		});
		expect(res.status).toBe(200);
		expect(services.getProductDetail).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ id: "u-1" }),
			"p-1",
		);
	});

	it("rejects a blank id before calling the service", async () => {
		const { GET } = await import(
			"../../src/app/(frontend)/api/products/[id]/detail/route"
		);
		const res = await GET(new Request("http://x/api/products//detail"), {
			params: Promise.resolve({ id: "" }),
		});
		expect(res.status).toBe(400);
		expect(services.getProductDetail).not.toHaveBeenCalled();
	});
});

describe("stock", () => {
	it("maps stock.negative to 409", async () => {
		services.recordMovement.mockRejectedValue(
			new ServiceError("stock.negative", 409),
		);
		const { POST } = await import(
			"../../src/app/(frontend)/api/variants/[id]/stock-movements/route"
		);
		const res = await POST(
			post("http://x", { type: "loss", quantity: -5 }),
			params("v-1"),
		);
		expect(res.status).toBe(409);
		expect(await res.json()).toMatchObject({ code: "stock.negative" });
	});

	it("returns 201 with the movement and variant", async () => {
		services.recordMovement.mockResolvedValue({
			movement: { id: "sm-1" },
			variant: { id: "v-1" },
			crossedLowStock: false,
		});
		const { POST } = await import(
			"../../src/app/(frontend)/api/variants/[id]/stock-movements/route"
		);
		const res = await POST(
			post("http://x", { type: "receipt", quantity: 5 }),
			params("v-1"),
		);
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({
			movement: { id: "sm-1" },
			variant: { id: "v-1" },
		});
	});

	it("rejects an unknown movement type before calling the service", async () => {
		const { POST } = await import(
			"../../src/app/(frontend)/api/variants/[id]/stock-movements/route"
		);
		const res = await POST(
			post("http://x", { type: "teleport", quantity: 1 }),
			params("v-1"),
		);
		expect(res.status).toBe(400);
		expect(services.recordMovement).not.toHaveBeenCalled();
	});

	it("lists movements with parsed query", async () => {
		services.listMovements.mockResolvedValue({ docs: [] });
		const { GET } = await import(
			"../../src/app/(frontend)/api/shops/[id]/stock-movements/route"
		);
		await GET(
			new Request(
				"http://x?variant=v-1&type=receipt,loss&from=2026-09-01&page=3",
			),
			params("s-1"),
		);
		expect(services.listMovements).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			"s-1",
			{
				variant: "v-1",
				type: "receipt,loss",
				from: "2026-09-01",
				page: 3,
				limit: 20,
			},
		);
	});

	it("serves the summary and stock counts", async () => {
		services.stockSummary.mockResolvedValue({ costValue: 1 });
		services.recordStockCount.mockResolvedValue({ results: [] });
		const summary = await import(
			"../../src/app/(frontend)/api/shops/[id]/stock-summary/route"
		);
		const counts = await import(
			"../../src/app/(frontend)/api/shops/[id]/stock-counts/route"
		);
		expect(
			await (await summary.GET(new Request("http://x"), params("s-1"))).json(),
		).toEqual({ costValue: 1 });
		expect(
			(await counts.POST(post("http://x", { counts: [] }), params("s-1")))
				.status,
		).toBe(200);
	});
});
