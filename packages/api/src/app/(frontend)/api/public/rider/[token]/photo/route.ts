import type { File as PayloadFile } from "payload";
import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import {
	publicRiderContext,
	resolveRiderLink,
} from "@/services/delivery/riderLinks";

const paramsSchema = z.object({ token: z.string().min(1).max(128) });
const kindSchema = z.enum(["attempt", "handover"]);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png"]);

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success)
		return errorResponse(ERROR_CODES.shipmentRiderLinkInvalid, 404);
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return errorResponse(ERROR_CODES.badRequest, 400);
	}
	const file = form.get("file");
	const kind = kindSchema.safeParse(form.get("kind"));
	if (
		!(file instanceof File) ||
		!kind.success ||
		file.size < 1 ||
		file.size > MAX_PHOTO_BYTES ||
		!PHOTO_TYPES.has(file.type)
	) {
		return errorResponse(ERROR_CODES.badRequest, 400);
	}
	try {
		const { payload } = await publicRiderContext(request, parsed.data.token);
		const proof = await withTransaction(payload, async (req) => {
			const shipment = await resolveRiderLink(
				req.payload,
				parsed.data.token,
				req,
			);
			return req.payload.create({
				collection: "delivery-proofs",
				req,
				overrideAccess: true,
				file: {
					data: Buffer.from(await file.arrayBuffer()),
					name: file.name,
					mimetype: file.type,
					size: file.size,
				} satisfies PayloadFile,
				data: {
					shipment: String(shipment.id),
					kind: kind.data,
					uploadedVia: "rider_link",
				},
			});
		});
		return Response.json(
			{ id: String(proof.id), kind: proof.kind, size: proof.filesize },
			{ status: 201 },
		);
	} catch (error) {
		return handleServiceError("public-rider:photo", error);
	}
}
