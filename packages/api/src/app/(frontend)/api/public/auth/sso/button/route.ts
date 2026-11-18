import { ssoConfig } from "@/auth/sso/config";

/**
 * What the website's sign-in needs to show the SSO button — asked only when
 * the page is opened with `?sso=overbrand`; 404 while the SSO is off. The
 * icon goes through /api so the website's relay serves it too.
 */
export function GET() {
	const config = ssoConfig(process.env);
	if (!config) return Response.json({ enabled: false }, { status: 404 });
	return Response.json({
		enabled: true,
		label: config.label,
		icon: "/api/public/auth/sso/icon",
	});
}
