import type { File as PayloadUploadFile } from "payload";
import { z } from "zod";
import {
	DOCUMENT_KINDS,
	MAX_VERIFICATION_FILE_SIZE,
	VERIFICATION_MIME_TYPES,
} from "@/collections/VerificationDocuments";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { getVerificationSettings } from "@/lib/verificationSettings";
import { addDocument } from "@/services/verificationDocuments";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const kindSchema = z.enum(DOCUMENT_KINDS);

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const settings = await getVerificationSettings(ctx.payload);
	if (!settings.enabled)
		return errorResponse(ERROR_CODES.verificationDisabled, 403);

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return errorResponse(ERROR_CODES.badRequest, 400);
	}

	const file = form.get("file");
	if (!(file instanceof File))
		return errorResponse(ERROR_CODES.badRequest, 400);

	const parsedKind = kindSchema.safeParse(form.get("kind"));
	if (!parsedKind.success) return errorResponse(ERROR_CODES.badRequest, 400);

	if (!(VERIFICATION_MIME_TYPES as readonly string[]).includes(file.type)) {
		return errorResponse(ERROR_CODES.uploadInvalidType, 400);
	}
	if (file.size > MAX_VERIFICATION_FILE_SIZE) {
		return errorResponse(ERROR_CODES.uploadTooLarge, 413);
	}

	try {
		const uploadFile: PayloadUploadFile = {
			data: Buffer.from(await file.arrayBuffer()),
			name: file.name,
			mimetype: file.type,
			size: file.size,
		};
		const created = await addDocument(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			uploadFile,
			parsedKind.data,
		);
		return Response.json(
			{
				id: String(created.id),
				kind: created.kind,
				originalFilename: created.originalFilename ?? "",
				mimeType: created.mimeType ?? file.type,
				filesize: created.filesize ?? file.size,
				createdAt: created.createdAt,
			},
			{ status: 201 },
		);
	} catch (error) {
		return handleServiceError("verification:document-upload", error);
	}
}
