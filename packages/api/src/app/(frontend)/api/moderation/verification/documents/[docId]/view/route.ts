import { VERIFICATION_SERVICE_CONTEXT } from "@/collections/VerificationRequests";
import { clientIp } from "@/lib/clientIp";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { peppered } from "@/lib/hash";
import { handleModerationError, requireModerator } from "@/lib/moderationRoute";
import { createSignedDocumentUrl } from "@/lib/privateFiles";
import { relationId } from "@/lib/relationId";

/**
 * The only door to an identity document: the view row is written first, and
 * the signed URL is minted only once that write has committed. A document
 * that could be opened without leaving a record would make the audit trail
 * a suggestion rather than evidence, so a failed insert here must return no
 * URL at all — the outer catch turns it into a plain 500.
 *
 * This route never consults the verification feature flag: the flag gates
 * new intake, not a review already in flight, so pausing it must not strand
 * a document a reviewer is in the middle of checking.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ docId: string }> },
) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;

	const { docId } = await params;

	try {
		const doc = await ctx.payload
			.findByID({
				collection: "verification-documents",
				id: docId,
				depth: 0,
				overrideAccess: true,
			})
			.catch(() => null);
		if (!doc || doc.purgedAt) return errorResponse(ERROR_CODES.notFound, 404);

		const requestId = relationId(doc.request);
		const verificationRequest = requestId
			? await ctx.payload
					.findByID({
						collection: "verification-requests",
						id: requestId,
						depth: 0,
						overrideAccess: true,
					})
					.catch(() => null)
			: null;
		if (!verificationRequest) return errorResponse(ERROR_CODES.notFound, 404);

		const isAdminCaller = ctx.actor.role === "admin";
		if (
			!isAdminCaller &&
			relationId(verificationRequest.assignee) !== ctx.actor.id
		) {
			return errorResponse(ERROR_CODES.verificationNotAssignee, 403);
		}

		await ctx.payload.create({
			collection: "verification-document-views",
			overrideAccess: true,
			context: VERIFICATION_SERVICE_CONTEXT,
			data: {
				document: doc.id,
				request: verificationRequest.id,
				viewer: ctx.actor.id,
				viewerRole: ctx.actor.role ?? "moderator",
				ipHash: peppered(clientIp(request)),
				userAgent: (request.headers.get("user-agent") ?? "").slice(0, 200),
			},
		});

		const signed = await createSignedDocumentUrl(
			{
				id: String(doc.id),
				filename: String(doc.filename ?? ""),
				mimeType: doc.mimeType,
				prefix: "verification",
			},
			60,
		);

		return Response.json({
			url: signed.url,
			expiresAt: signed.expiresAt.toISOString(),
			mimeType: String(doc.mimeType ?? "application/octet-stream"),
		});
	} catch (error) {
		return handleModerationError("verification:document-view", error);
	}
}
