import config from "@payload-config";
import { getPayload } from "payload";
import { verifyMobileTransferToken } from "@/auth/oauth/flow";
import { issuePayloadSession } from "@/auth/oauth/session";

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as { transferToken?: string };

		if (!body.transferToken) {
			return Response.json(
				{ error: "transferToken is required" },
				{ status: 400 },
			);
		}

		const { userId } = await verifyMobileTransferToken(body.transferToken);
		const payload = await getPayload({ config });
		const user = await payload.findByID({
			collection: "users",
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
		return Response.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Mobile OAuth exchange failed",
			},
			{ status: 401 },
		);
	}
}
