import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { changeMemberRole, removeMember } from "@/services/shopMembers";

type Params = { params: Promise<{ id: string; memberId: string }> };

const paramsSchema = z.object({
	id: z.string().trim().min(1),
	memberId: z.string().trim().min(1),
});
const roleSchema = z.object({ role: z.enum(["manager", "staff"]) });

export async function PATCH(request: Request, { params }: Params) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = roleSchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await changeMemberRole(
				ctx.payload,
				ctx.user,
				parsed.data.id,
				parsed.data.memberId,
				body.data.role,
			),
		);
	} catch (error) {
		return handleServiceError("team:role", error);
	}
}

export async function DELETE(request: Request, { params }: Params) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(
			await removeMember(
				ctx.payload,
				ctx.user,
				parsed.data.id,
				parsed.data.memberId,
			),
		);
	} catch (error) {
		return handleServiceError("team:remove", error);
	}
}
