import type { MetadataRoute } from "next";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://buynsellem.com";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export const revalidate = 3600;

const staticRoutes: MetadataRoute.Sitemap = [
	{ url: WEB_URL, priority: 1.0, changeFrequency: "daily" },
	{ url: `${WEB_URL}/search`, priority: 0.9, changeFrequency: "hourly" },
	{ url: `${WEB_URL}/help`, priority: 0.5, changeFrequency: "monthly" },
	{ url: `${WEB_URL}/contact`, priority: 0.4, changeFrequency: "yearly" },
	{ url: `${WEB_URL}/safety`, priority: 0.3, changeFrequency: "yearly" },
	{ url: `${WEB_URL}/privacy`, priority: 0.2, changeFrequency: "yearly" },
	{ url: `${WEB_URL}/terms`, priority: 0.2, changeFrequency: "yearly" },
	{ url: `${WEB_URL}/cookies`, priority: 0.2, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	try {
		const res = await fetch(
			`${API_URL}/api/listings?where[status][equals]=published&limit=5000&depth=0&sort=-updatedAt`,
			{ next: { revalidate: 3600 } },
		);
		if (!res.ok) return staticRoutes;

		const data = await res.json();
		const listingRoutes: MetadataRoute.Sitemap = (data.docs ?? []).map(
			(l: { id: string; updatedAt: string }) => ({
				url: `${WEB_URL}/listing/${l.id}`,
				lastModified: new Date(l.updatedAt),
				priority: 0.8,
				changeFrequency: "daily" as const,
			}),
		);

		return [...staticRoutes, ...listingRoutes];
	} catch {
		return staticRoutes;
	}
}
