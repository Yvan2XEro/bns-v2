import { handleModerationError, requireModerator } from "@/lib/moderationRoute";
import { getRiskFlagStats } from "@/services/riskFlagStats";

export async function GET(request: Request) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	try {
		return Response.json(await getRiskFlagStats(ctx.payload, ctx.actor), {
			headers: { "Cache-Control": "private, no-store" },
		});
	} catch (error) {
		return handleModerationError("risk-flags:stats", error);
	}
}
