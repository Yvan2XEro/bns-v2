import type { CollectionConfig } from "payload";
import { isAdmin } from "../access/roles";
import { nobody } from "../access/staff";

/**
 * Append-only audit of every look at an identity document. Readable by
 * admins only — a moderator reading the log would be reading which of their
 * colleagues looked at what, which is not what this record is for.
 */
export const VerificationDocumentViews: CollectionConfig = {
	slug: "verification-document-views",
	admin: {
		useAsTitle: "createdAt",
		defaultColumns: ["document", "viewer", "viewerRole", "createdAt"],
		hidden: ({ user }) => !isAdmin(user as { role?: string } | undefined),
	},
	access: {
		read: ({ req: { user } }) => isAdmin(user as { role?: string } | undefined),
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	fields: [
		{
			type: "row",
			fields: [
				{
					name: "document",
					type: "relationship",
					relationTo: "verification-documents",
					required: true,
					index: true,
					admin: { width: "33%" },
				},
				{
					name: "request",
					type: "relationship",
					relationTo: "verification-requests",
					required: true,
					index: true,
					admin: { width: "33%" },
				},
				{
					name: "viewer",
					type: "relationship",
					relationTo: "users",
					required: true,
					index: true,
					admin: { width: "33%" },
				},
			],
		},
		{
			type: "row",
			fields: [
				{ name: "viewerRole", type: "text", admin: { width: "33%" } },
				{ name: "ipHash", type: "text", admin: { width: "33%" } },
				{
					name: "userAgent",
					type: "text",
					maxLength: 200,
					admin: { width: "33%" },
				},
			],
		},
	],
	timestamps: true,
};
