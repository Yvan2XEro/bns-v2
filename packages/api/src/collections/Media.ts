import path from "node:path";
import type { CollectionConfig } from "payload";
import { authenticated } from "../access/authenticated";

const adminOnly = ({ req: { user } }: { req: { user?: unknown } }) => {
	if (!user) return false;
	return (user as { role?: string }).role === "admin";
};

export const Media: CollectionConfig = {
	slug: "media",
	access: {
		read: () => true,
		// Uploads are created by any signed-in user (listing photos, avatars).
		// Mutating or removing an existing upload is admin-only: media carries no
		// owner field, so there is no way to scope it per user. Server-side
		// cleanup (account deletion) runs with overrideAccess and is unaffected.
		create: authenticated,
		update: adminOnly,
		delete: adminOnly,
	},
	fields: [
		{
			name: "alt",
			type: "text",
			required: true,
		},
	],
	upload: {
		staticDir: path.resolve(process.cwd(), "media"),
	},
};
