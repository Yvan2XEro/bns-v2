import { appleAppSiteAssociation } from "../../../../../api/src/contracts/appLinks";

/**
 * Served at `/.well-known/apple-app-site-association` (next.config rewrite):
 * iOS reads it when the app is installed and from then on opens these links
 * in the app. Needs the Apple Developer Team ID; without it, no file, and
 * links keep opening in the browser.
 */
export function GET() {
	const teamId = process.env.APPLE_TEAM_ID?.trim();
	if (!teamId) return new Response(null, { status: 404 });
	return Response.json(appleAppSiteAssociation(teamId), {
		headers: { "Cache-Control": "public, max-age=3600" },
	});
}
