import { androidAssetLinks } from "../../../../../api/src/contracts/appLinks";

/**
 * Served at `/.well-known/assetlinks.json` (next.config rewrite): Android
 * checks it when the app is installed, then opens this site's links in the
 * app without asking. Needs the SHA-256 of the key Google Play signs the app
 * with (Play Console → App integrity), comma-separated when there are several.
 */
export function GET() {
	const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
		.split(",")
		.map((value) => value.trim().toUpperCase())
		.filter(Boolean);
	if (fingerprints.length === 0) return new Response(null, { status: 404 });
	return Response.json(androidAssetLinks(fingerprints), {
		headers: { "Cache-Control": "public, max-age=3600" },
	});
}
