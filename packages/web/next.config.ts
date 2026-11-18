import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { PERMANENT_REDIRECTS } from "./src/lib/redirects";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const nextConfig: NextConfig = {
	// No Content-Security-Policy header is set here yet, so the reviewer's
	// signed document URLs (Task 25) need no img-src/frame-src entry.
	output: "standalone",
	turbopack: {
		root: process.env.TURBOPACK_ROOT || "../..",
	},
	images: {
		remotePatterns: [
			{
				protocol: "http",
				hostname: "localhost",
			},
			{
				protocol: "https",
				hostname: "**",
			},
		],
	},
	async redirects() {
		return [...PERMANENT_REDIRECTS];
	},
	async rewrites() {
		return [
			// The app association files must sit under /.well-known, which an
			// app-router folder cannot be named.
			{
				source: "/.well-known/apple-app-site-association",
				destination: "/well-known/apple-app-site-association",
			},
			{
				source: "/.well-known/assetlinks.json",
				destination: "/well-known/assetlinks.json",
			},
			{
				source: "/api/:path*",
				destination: `${API_URL}/api/:path*`,
			},
		];
	},
};

export default withNextIntl(nextConfig);
