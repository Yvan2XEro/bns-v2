import type { CollectionConfig } from "payload";
import { isAdmin, isModerator } from "../access/roles";

export const MODERATION_ACTIONS = [
	"listing.approve",
	"listing.reject",
	"listing.takedown",
	"listing.holdRelease",
	"user.suspend",
	"user.unsuspend",
	"shop.suspend",
	"shop.unsuspend",
	"report.resolve",
	"report.dismiss",
	"verification.claim",
	"verification.release",
	"verification.request_info",
	"verification.approve",
	"verification.reject",
	"verification.revoke",
	"verification.expire",
	"order.cancel",
	"commission.waive",
	"payout.hold",
	"payout.release",
	"payout.account_approve",
	"payout.account_reject",
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
			/**
			 * Optional only for system entries: scheduled expiry of a draft
			 * request and a stale-claim release have no human behind them, and
			 * `actorRole: "system"` is what the entry means. Every human action
			 * still fails validation without an actor, so an action cannot be
			 * taken anonymously by leaving the field out.
			 */
			name: "actor",
			type: "relationship",
			relationTo: "users",
			index: true,
			admin: { readOnly: true },
			validate: (
				value: unknown,
				{ siblingData }: { siblingData: { actorRole?: string } },
			) =>
				value || siblingData?.actorRole === "system"
					? true
					: "An actor is required unless the entry is a system entry.",
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
				{ label: "Shop", value: "shop" },
				{ label: "Verification request", value: "verification-request" },
				{ label: "Order", value: "order" },
				{ label: "Commission invoice", value: "commission-invoice" },
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
