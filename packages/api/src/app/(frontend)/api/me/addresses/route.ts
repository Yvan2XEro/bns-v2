import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { createAddress, listAddresses } from "@/services/addresses";

// Shape only: every rule is the service's (the shared address contract).
const bodySchema = z.record(z.unknown());

export async function GET(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(await listAddresses(ctx.payload, ctx.user));
	} catch (error) {
		return handleServiceError("addresses:list", error);
	}
}

export async function POST(request: Request) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await createAddress(ctx.payload, ctx.user, body.data),
			{ status: 201 },
		);
	} catch (error) {
		return handleServiceError("addresses:create", error);
	}
}
