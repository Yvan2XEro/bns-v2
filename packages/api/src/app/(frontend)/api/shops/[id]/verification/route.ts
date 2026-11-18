import { z } from "zod";
import { can, resolveShopRole } from "@/access/shopRoles";
import { assertNotSuspended } from "@/hooks/suspensionGuard";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { relationId } from "@/lib/relationId";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { getShopVerificationView } from "@/lib/verificationView";
import { findShop } from "@/services/shopGuards";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

/**
 * The one route that never consults `verification.enabled` as a gate: it
 * reports the flag alongside the current state instead. A seller mid-review
 * when the feature is paused must still see where they stand.
 */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		const shop = await findShop(ctx.payload, parsedParams.data.id);
		// Named through the matrix rather than compared against `shop.owner`,
		// so this route cannot drift from the permission that governs the
		// write it reports on. It keeps `verification.notOwner` instead of the
		// matrix's `shop.forbidden`: five sibling call sites throw that code
		// and a mobile screen renders it, so changing it here alone would make
		// one route in six answer differently for the same refusal.
		const role = await resolveShopRole(
			ctx.payload,
			ctx.user.id,
			String(shop.id),
		);
		if (!can(role, "verification.submit")) {
			return errorResponse(ERROR_CODES.verificationNotOwner, 403);
		}
		await assertNotSuspended(ctx.payload, ctx.user.id, ctx.user);
		const view = await getShopVerificationView(ctx.payload, shop);
		return Response.json(view);
	} catch (error) {
		return handleServiceError("verification:read", error);
	}
}
