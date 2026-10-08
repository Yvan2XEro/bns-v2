import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import config from "@payload-config";
import { getPayload } from "payload";
import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { verifyLocalFileToken } from "@/lib/privateFiles";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const querySchema = z.object({
	exp: z.coerce.number(),
	sig: z.string().trim().min(1),
});

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	const url = new URL(request.url);
	const parsedQuery = querySchema.safeParse({
		exp: url.searchParams.get("exp") ?? undefined,
		sig: url.searchParams.get("sig") ?? undefined,
	});
	if (!parsedParams.success || !parsedQuery.success) {
		return errorResponse(ERROR_CODES.badRequest, 400);
	}
	const { id } = parsedParams.data;
	if (!verifyLocalFileToken(id, parsedQuery.data.exp, parsedQuery.data.sig)) {
		return errorResponse(ERROR_CODES.forbidden, 403);
	}
	const payload = await getPayload({ config });
	const evidence = await payload
		.findByID({
			collection: "dispute-evidence",
			id,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!evidence?.filename) return errorResponse(ERROR_CODES.notFound, 404);
	const directory = path.resolve(
		process.cwd(),
		process.env.PRIVATE_UPLOADS_DIR ?? "private-uploads/verification",
		"..",
		"dispute-evidence",
	);
	const filePath = path.join(directory, path.basename(evidence.filename));
	const fileInfo = await stat(filePath).catch(() => null);
	if (!fileInfo?.isFile()) return errorResponse(ERROR_CODES.notFound, 404);
	const contents = await readFile(filePath);
	return new Response(contents, {
		headers: {
			"Content-Type": evidence.mimeType ?? "application/octet-stream",
			"Content-Length": String(fileInfo.size),
			"Content-Disposition": "inline",
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
