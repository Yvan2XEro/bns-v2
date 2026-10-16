import type { MetadataRoute } from "next";
import { APP_STORE_URL, PLAY_STORE_URL } from "~/lib/app-stores";

/**
 * Makes the site installable on a computer (Chrome and Edge offer "Install
 * BuyNSellem" from the address bar). On a phone the native app is the one
 * offered — `AppBanner` and Apple's Smart App Banner — so the native apps
 * are declared here too, without asking browsers to prefer them over the
 * desktop install.
 */
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Buy'N'Sellem",
		short_name: "BuyNSellem",
		description:
			"La marketplace locale pour acheter et vendre près de chez vous.",
		start_url: "/",
		scope: "/",
		display: "standalone",
		background_color: "#F8FAFC",
		theme_color: "#1E40AF",
		lang: "fr",
		icons: [
			{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
			{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
			{
				src: "/icons/icon-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "maskable",
			},
		],
		related_applications: [
			{ platform: "play", url: PLAY_STORE_URL, id: "com.buynsellem.mobile" },
			{ platform: "itunes", url: APP_STORE_URL },
		],
		prefer_related_applications: false,
	};
}
