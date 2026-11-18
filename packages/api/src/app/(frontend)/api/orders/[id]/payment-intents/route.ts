import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import {
	createCheckoutIntent,
	findOrderForPayment,
} from "@/services/checkoutPayment";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({
	channel: z.string().trim().min(1).max(40),
	phone: z.string().trim().min(1).max(30),
});
const keySchema = z.string().trim().uuid();

/** Header `Idempotency-Key: <uuid>`, body `{ channel, phone }`. */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const key = keySchema.safeParse(request.headers.get("idempotency-key"));
	const body = bodySchema.safeParse(await readBody(request));
	if (!key.success || !body.success) {
		return errorResponse(ERROR_CODES.badRequest, 400);
	}

	try {
		const order = await findOrderForPayment(ctx.payload, parsedParams.data.id);
		return Response.json(
			await createCheckoutIntent({ payload: ctx.payload }, order, ctx.user, {
				...body.data,
				idempotencyKey: key.data,
			}),
		);
	} catch (error) {
		return handleServiceError("orders:payment-intents", error);
	}
}
