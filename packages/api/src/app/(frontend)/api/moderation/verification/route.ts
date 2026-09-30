import type { Where } from "payload";
import { z } from "zod";
import { REVIEW_SIGNAL_CODES } from "@/collections/VerificationRequests";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleModerationError, requireModerator } from "@/lib/moderationRoute";
import { relationId } from "@/lib/relationId";
import { type QueueKey, queueSort, queueWhere } from "@/lib/verificationQueue";
import type { VerificationRequest } from "@/payload-types";

const QUERY_SCHEMA = z.object({
	queue: z
		.enum(["to_review", "mine", "needs_info", "decided"])
		.default("to_review"),
	level: z.coerce.number().int().min(2).max(3).optional(),
	signal: z.enum(REVIEW_SIGNAL_CODES).optional(),
});

function ageMs(
	submittedAt: string | null | undefined,
	now: Date,
): number | null {
	if (!submittedAt) return null;
	const at = Date.parse(submittedAt);
	return Number.isFinite(at) ? now.getTime() - at : null;
}

function signalsOf(request: VerificationRequest): string[] {
	return (request.reviewSignals ?? []).map((signal) => signal.code);
}

/**
 * The reviewer queue. Never consults the verification feature flag: an
 * in-flight review must finish while intake is paused, the same rule the
 * document-view route (Task 15) applies.
 */
export async function GET(request: Request) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;

	const url = new URL(request.url);
	const parsed = QUERY_SCHEMA.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const { queue, level, signal } = parsed.data;

	try {
		const now = new Date();
		const conditions: Where[] = [
			queueWhere(queue as QueueKey, ctx.actor.id, now),
		];
		if (level !== undefined) {
			conditions.push({ requestedLevel: { equals: level } });
		}
		if (signal) {
			conditions.push({ "reviewSignals.code": { equals: signal } });
		}
		const where: Where =
			conditions.length > 1 ? { and: conditions } : conditions[0];

		const found = await ctx.payload.find({
			collection: "verification-requests",
			depth: 0,
			pagination: false,
			overrideAccess: true,
			where,
			sort: queueSort(queue as QueueKey),
		});

		const items = found.docs.map((doc) => ({
			id: String(doc.id),
			shopId: relationId(doc.shop),
			requestedLevel: doc.requestedLevel,
			status: doc.status,
			submittedAt: doc.submittedAt ?? null,
			ageMs: ageMs(doc.submittedAt, now),
			signals: signalsOf(doc),
			assignee: relationId(doc.assignee),
		}));

		return Response.json({ queue, total: items.length, items });
	} catch (error) {
		return handleModerationError("verification:queue", error);
	}
}
