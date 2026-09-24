import path from "node:path";
import type { CollectionConfig } from "payload";
import { authenticated } from "../access/authenticated";
import {
	ALLOWED_MEDIA_MIME_TYPES,
	enforceMediaFileLimits,
} from "../hooks/mediaLimits";

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
	hooks: {
		// Catches both the REST upload and the local API (category seed
		// script), and answers with the shared error codes rather than
		// Payload's own validation string — see hooks/mediaLimits.ts.
		beforeOperation: [enforceMediaFileLimits],
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
		// Also restricts the admin panel's file picker; enforceMediaFileLimits
		// is what actually produces the shared error code for API clients.
		mimeTypes: [...ALLOWED_MEDIA_MIME_TYPES],
	},
};
