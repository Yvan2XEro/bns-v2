import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import config from "@payload-config";
import { getPayload } from "payload";
import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { verifyLocalFileToken } from "@/lib/privateFiles";

const paramsSchema = z.object({ docId: z.string().trim().min(1) });
const querySchema = z.object({
	exp: z.coerce.number(),
	sig: z.string().trim().min(1),
});

/**
 * Only reachable with the local storage provider, which is refused in
 * production (plugins/storage.ts). The signature is the whole authorisation:
 * it is minted by the moderation view route, which has already written the
 * view log, so there is no second authorisation check here to drift from it.
 */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ docId: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const url = new URL(request.url);
	const parsedQuery = querySchema.safeParse({
		exp: url.searchParams.get("exp") ?? undefined,
		sig: url.searchParams.get("sig") ?? undefined,
	});
	if (!parsedQuery.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const { docId } = parsedParams.data;
	const { exp, sig } = parsedQuery.data;

	if (!verifyLocalFileToken(docId, exp, sig)) {
		return errorResponse(ERROR_CODES.forbidden, 403);
	}

	const payload = await getPayload({ config });
	const doc = await payload
		.findByID({
			collection: "verification-documents",
			id: docId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!doc?.filename || doc.purgedAt)
		return errorResponse(ERROR_CODES.notFound, 404);

	const dir = path.resolve(
		process.cwd(),
		process.env.PRIVATE_UPLOADS_DIR ?? "private-uploads/verification",
	);
	const file = path.join(dir, path.basename(doc.filename));
	const info = await stat(file).catch(() => null);
	if (!info?.isFile()) return errorResponse(ERROR_CODES.notFound, 404);

	// Read the whole file rather than stream it: this route only serves the
	// local provider, capped at MAX_VERIFICATION_FILE_SIZE (10MB), and a
	// buffer sidesteps the mismatch between Node's and the DOM's
	// `ReadableStream` types without a cast that would paper over it.
	const contents = await readFile(file);

	return new Response(contents, {
		headers: {
			"Content-Type": doc.mimeType ?? "application/octet-stream",
			"Content-Length": String(info.size),
			"Content-Disposition": "inline",
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
