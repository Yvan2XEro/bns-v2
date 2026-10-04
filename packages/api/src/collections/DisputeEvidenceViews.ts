import type { CollectionConfig } from "payload";
import { isAdmin } from "../access/roles";
import { nobody } from "../access/staff";

const adminOnly = ({
	req: { user },
}: {
	req: { user?: { role?: string } | null };
}) => isAdmin(user);

export const DisputeEvidenceViews: CollectionConfig = {
	slug: "dispute-evidence-views",
	admin: {
		useAsTitle: "createdAt",
		defaultColumns: ["evidence", "dispute", "viewer", "createdAt"],
		hidden: ({ user }) => !isAdmin(user as { role?: string } | undefined),
	},
	access: { read: adminOnly, create: nobody, update: nobody, delete: nobody },
	fields: [
		{
			name: "evidence",
			type: "relationship",
			relationTo: "dispute-evidence",
			required: true,
			index: true,
		},
		{
			name: "dispute",
			type: "relationship",
			relationTo: "disputes",
			index: true,
		},
		{
			name: "returnCase",
			type: "relationship",
			relationTo: "return-cases",
			index: true,
		},
		{
			name: "viewer",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
		},
		{ name: "viewerRole", type: "text" },
		{ name: "ipHash", type: "text" },
		{ name: "userAgent", type: "text", maxLength: 200 },
	],
	timestamps: true,
};
