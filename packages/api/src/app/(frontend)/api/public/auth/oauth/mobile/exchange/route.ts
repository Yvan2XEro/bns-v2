import config from "@payload-config";
import { getPayload } from "payload";
import { verifyMobileTransferToken } from "@/auth/oauth/flow";
import { issuePayloadSession } from "@/auth/oauth/session";

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as { transferToken?: string };

		if (!body.transferToken) {
			return Response.json(
				{ message: "transferToken is required" },
				{ status: 400 },
			);
		}

		const payload = await getPayload({ config });
		const { userId } = await verifyMobileTransferToken(body.transferToken);
		const user = await payload.findByID({
			collection: "users",
			depth: 0,
			id: userId,
			overrideAccess: true,
		});
		const { exp, token } = await issuePayloadSession(payload, user as never);

		return Response.json({
			exp,
			message: "OAuth login successful",
			token,
			user,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Mobile OAuth exchange failed";
		const status =
			message === "Invalid mobile OAuth transfer token" ||
			message.includes('"exp" claim timestamp check failed') ||
			message.includes('"nbf" claim timestamp check failed')
				? 401
				: 500;

		console.error("[oauth] mobile exchange failed:", error);

		return Response.json(
			{
				message,
			},
			{ status },
		);
	}
}
