import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { listResaleLinks, requestResaleLink } from "@/services/resaleLinks";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	supplierShop: z.string().trim().min(1),
	message: z.string().max(500).optional(),
	acceptTermsVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const querySchema = z.object({
	side: z.enum(["supplier", "reseller"]),
	status: z.enum(["requested", "approved", "suspended", "revoked"]).optional(),
});

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const query = querySchema.safeParse(
		Object.fromEntries(new URL(request.url).searchParams),
	);
	if (!query.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		const links = await listResaleLinks(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			query.data,
		);
		return Response.json(links);
	} catch (error) {
		return handleServiceError("resaleLinks:list", error);
	}
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const link = await requestResaleLink(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			body.data,
		);
		return Response.json(link, { status: 201 });
	} catch (error) {
		return handleServiceError("resaleLinks:request", error);
	}
}
