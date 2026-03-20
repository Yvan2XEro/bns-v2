import { listConfiguredOAuthProviders } from "@/auth/oauth/providers";

export async function GET() {
	return Response.json({
		providers: listConfiguredOAuthProviders(),
	});
}
