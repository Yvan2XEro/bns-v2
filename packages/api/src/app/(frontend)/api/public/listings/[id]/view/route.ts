import config from "@payload-config";
import { getPayload } from "payload";
import { z } from "zod";
import { countListingView } from "@/services/listingViews";

const paramsSchema = z.object({ id: z.string().trim().min(1).max(100) });
const NO_CONTENT = () => new Response(null, { status: 204 });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return NO_CONTENT();
	try {
		const payload = await getPayload({ config });
		const { user } = await payload
			.auth({ headers: request.headers })
			.catch(() => ({ user: null }));
		const forwardedFor = request.headers.get("x-forwarded-for");
		const ip =
			forwardedFor?.split(",")[0]?.trim() ||
			request.headers.get("x-real-ip") ||
			"unknown";
		await countListingView(payload, {
			listingId: parsed.data.id,
			viewerId: user ? String(user.id) : null,
			installId: request.headers.get("x-bns-install-id"),
			ip,
			userAgent: request.headers.get("user-agent") ?? "",
		});
	} catch (error) {
		// Analytics must not block a public listing view; the nightly job can
		// safely process whatever was recorded before a transient failure.
		console.error("[listing-view] Failed to count listing view", error);
	}
	return NO_CONTENT();
}
