import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { listCatalogue } from "@/services/catalogue";
import { createProduct } from "@/services/products";

type Params = { params: Promise<{ id: string }> };

const intParam = (value: string | null, fallback: number) => {
	const n = Number.parseInt(value ?? "", 10);
	return Number.isFinite(n) ? n : fallback;
};

export async function GET(request: Request, { params }: Params) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const { id } = await params;
	const search = new URL(request.url).searchParams;
	try {
		return Response.json(
			await listCatalogue(ctx.payload, ctx.user, id, {
				status: search.get("status"),
				stock: search.get("stock"),
				q: search.get("q"),
				page: intParam(search.get("page"), 1),
				limit: intParam(search.get("limit"), 20),
			}),
		);
	} catch (error) {
		return handleServiceError("catalogue", error);
	}
}

export async function POST(request: Request, { params }: Params) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const { id } = await params;
	try {
		return Response.json(
			await createProduct(ctx.payload, ctx.user, id, await readBody(request)),
			{ status: 201 },
		);
	} catch (error) {
		return handleServiceError("product:create", error);
	}
}
