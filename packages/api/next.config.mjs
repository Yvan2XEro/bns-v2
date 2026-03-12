import { withPayload } from "@payloadcms/next/withPayload";

/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "standalone",
	turbopack: {
		root: process.env.TURBOPACK_ROOT || "../..",
	},
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
