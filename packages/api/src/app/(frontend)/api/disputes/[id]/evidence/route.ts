import type { File as PayloadFile } from "payload";
import { z } from "zod";
import { DISPUTE_EVIDENCE_KINDS } from "@/collections/DisputeEvidence";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { uploadEvidence } from "@/services/disputeEvidence";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const kindSchema = z.enum(DISPUTE_EVIDENCE_KINDS);

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return errorResponse(ERROR_CODES.badRequest, 400);
	}
	const file = form.get("file");
	const kind = kindSchema.safeParse(form.get("kind"));
	if (!(file instanceof File) || !kind.success) {
		return errorResponse(ERROR_CODES.badRequest, 400);
	}
	try {
		const evidence = await uploadEvidence(ctx.payload, {
			disputeId: parsedParams.data.id,
			user: ctx.user,
			kind: kind.data,
			file: {
				data: Buffer.from(await file.arrayBuffer()),
				name: file.name,
				mimetype: file.type,
				size: file.size,
			} satisfies PayloadFile,
		});
		return Response.json(
			{
				id: String(evidence.id),
				kind: evidence.kind,
				mimeType: evidence.mimeType,
				size: evidence.size,
				capturedAt: evidence.capturedAt,
			},
			{ status: 201 },
		);
	} catch (error) {
		return handleServiceError("dispute:evidence-upload", error);
	}
}
