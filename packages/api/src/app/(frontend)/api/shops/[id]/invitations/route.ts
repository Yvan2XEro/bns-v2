import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { inviteMember } from "@/services/shopMembers";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	channel: z.enum(["phone", "email"]),
	phone: z.string().trim().max(24).optional(),
	email: z.string().trim().max(254).optional(),
	role: z.enum(["manager", "staff"]),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await inviteMember(ctx.payload, ctx.user, parsed.data.id, {
				channel: body.data.channel,
				phone: body.data.phone,
				email: body.data.email,
				role: body.data.role,
			}),
			{ status: 201 },
		);
	} catch (error) {
		return handleServiceError("team:invite", error);
	}
}
