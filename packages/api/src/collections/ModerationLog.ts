import type { CollectionConfig } from "payload";
import { isAdmin, isModerator } from "../access/roles";

export const MODERATION_ACTIONS = [
	"listing.approve",
	"listing.reject",
	"listing.takedown",
	"user.suspend",
	"user.unsuspend",
	"report.resolve",
	"report.dismiss",
] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

/**
 * Append-only. Writes are closed to every request including admins; the only
 * writer is services/moderation.ts via overrideAccess, in the same operation
 * that changes the target. An action cannot be applied without leaving a
 * trace, and a trace cannot be rewritten afterwards.
 */
export const ModerationLog: CollectionConfig = {
	slug: "moderation-log",
	admin: {
		useAsTitle: "action",
		defaultColumns: ["action", "actor", "targetType", "targetId", "createdAt"],
		description:
			"Immutable history of moderation actions. Written by the moderation endpoints; cannot be edited or removed.",
	},
	access: {
		read: ({ req: { user } }) => isModerator(user),
		create: () => false,
		update: () => false,
		delete: () => false,
		admin: ({ req: { user } }) => isAdmin(user),
	},
	fields: [
		{
			name: "actor",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
			admin: { readOnly: true },
		},
		{
			// Snapshot, not a join: roles change, the entry must keep saying what
			// authority the action was taken under.
			name: "actorRole",
			type: "text",
			required: true,
			admin: { readOnly: true },
		},
		{
			name: "action",
			type: "select",
			required: true,
			index: true,
			options: MODERATION_ACTIONS.map((value) => ({ label: value, value })),
			admin: { readOnly: true },
		},
		{
			name: "targetType",
			type: "select",
			required: true,
			options: [
				{ label: "Listing", value: "listing" },
				{ label: "User", value: "user" },
				{ label: "Report", value: "report" },
			],
			admin: { readOnly: true },
		},
		{
			name: "targetId",
			type: "text",
			required: true,
			index: true,
			admin: { readOnly: true },
		},
		{
			name: "reason",
			type: "text",
			admin: { readOnly: true },
		},
		{
			name: "note",
			type: "textarea",
			admin: {
				readOnly: true,
				description: "Internal. Never surfaced to the affected account.",
			},
		},
		{
			// Everything needed to undo or explain: previous status, duration,
			// ids of the listings taken down alongside.
			name: "metadata",
			type: "json",
			admin: { readOnly: true },
		},
	],
	timestamps: true,
};
