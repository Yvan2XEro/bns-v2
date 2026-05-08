import type { MetadataRoute } from "next";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://buynsellem.com";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: [
					"/create",
					"/favorites",
					"/messages",
					"/settings",
					"/profile/me",
					"/auth/",
					"/listing/*/edit",
				],
			},
		],
		sitemap: `${WEB_URL}/sitemap.xml`,
	};
}
