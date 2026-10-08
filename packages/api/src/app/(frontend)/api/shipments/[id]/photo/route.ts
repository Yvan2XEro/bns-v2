import type { File as PayloadFile } from "payload";
import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import {
	createSellerProofPhoto,
	PROOF_PHOTO_KINDS,
} from "@/services/delivery/proofPhotos";
import { requireShopShipment } from "@/services/delivery/routeAccess";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const kindSchema = z.enum(PROOF_PHOTO_KINDS);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png"]);

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
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
		const proof = await withTransaction(
			ctx.payload,
			async (req) => {
				const { shipment } = await requireShopShipment(
					ctx.payload,
					ctx.user,
					parsed.data.id,
					"orders.process",
					req,
				);
				return createSellerProofPhoto(
					req,
					shipment,
					{
						kind: kind.data,
						file: {
							data: Buffer.from(await file.arrayBuffer()),
							name: file.name,
							mimetype: file.type,
							size: file.size,
						} satisfies PayloadFile,
					},
					ctx.user.id,
				);
			},
			{ user: ctx.user },
		);
		return Response.json(
			{ id: String(proof.id), kind: proof.kind, size: proof.filesize },
			{ status: 201 },
		);
	} catch (error) {
		return handleServiceError("shipments:photo", error);
	}
}
