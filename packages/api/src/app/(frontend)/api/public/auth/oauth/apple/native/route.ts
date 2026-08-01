import config from "@payload-config";
import { getPayload } from "payload";
import {
	getAppleNativeClientId,
	getAppleNativeIdentity,
} from "@/auth/oauth/providers";
import { issuePayloadSession } from "@/auth/oauth/session";
import { resolveOAuthUser } from "@/auth/oauth/users";

/**
 * Native Sign in with Apple.
 *
 * The iOS app presents Apple's own Face ID sheet via `expo-apple-authentication`
 * and posts the resulting credential here. This is the flow Apple expects on
 * iOS; the browser-based flow under `../start` remains for web.
 */
export async function POST(request: Request) {
	try {
		if (!getAppleNativeClientId()) {
			return Response.json(
				{ error: "Native Sign in with Apple is not configured" },
				{ status: 501 },
			);
		}

		const body = (await request.json()) as {
			authorizationCode?: string;
			fullName?: string;
			identityToken?: string;
		};

		if (!body.identityToken) {
			return Response.json(
				{ error: "identityToken is required" },
				{ status: 400 },
			);
		}

		const identity = await getAppleNativeIdentity({
			authorizationCode: body.authorizationCode,
			fullName: body.fullName,
			identityToken: body.identityToken,
		});

		const payload = await getPayload({ config });
		const user = await resolveOAuthUser(payload, identity, {
			audience: "app",
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
						: "Native Apple sign-in failed",
			},
			{ status: 401 },
		);
	}
}
