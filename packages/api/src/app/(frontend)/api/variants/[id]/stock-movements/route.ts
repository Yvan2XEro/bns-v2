import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { recordMovement } from "@/services/stock";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const { id } = await params;
	try {
		const { movement, variant } = await recordMovement(
			ctx.payload,
			ctx.user,
			id,
			await readBody(request),
		);
		return Response.json({ movement, variant }, { status: 201 });
	} catch (error) {
		return handleServiceError("stock:move", error);
	}
}
