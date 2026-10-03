import { APIError, type CollectionConfig, type FieldAccess } from "payload";
import { isAdmin } from "../access/roles";
import { nobody, staffOnly } from "../access/staff";

export const RECONCILIATION_MISMATCH_KINDS = [
	"missing_locally",
	"missing_at_provider",
	"amount_mismatch",
	"status_mismatch",
	"balance_mismatch",
	"unbalanced_ledger",
] as const;

export const RECONCILIATION_MISMATCH_STATUSES = [
	"open",
	"auto_fixed",
	"resolved",
	"ignored",
] as const;

const NOTE_REQUIRED = new Set(["resolved", "ignored"]);

/** Everything but `status` and `note` is the reconciliation service's alone. */
const serviceOnly: { update: FieldAccess } = { update: () => false };

/**
 * Staff read; an admin may move `status` and write `note`, nothing else.
 * Closing a mismatch as `resolved` or `ignored` needs a note, and records who
 * closed it.
 */
export const ReconciliationMismatches: CollectionConfig = {
	slug: "reconciliation-mismatches",
	admin: {
		useAsTitle: "kind",
		defaultColumns: ["kind", "entityType", "shop", "status", "createdAt"],
	},
	access: {
		read: staffOnly,
		create: nobody,
		update: ({ req: { user } }) => isAdmin(user as { role?: string } | null),
		delete: nobody,
	},
	hooks: {
		beforeChange: [
			({ data, originalDoc, req }) => {
				const status = data.status ?? originalDoc?.status;
				const note = data.note ?? originalDoc?.note;
				if (NOTE_REQUIRED.has(String(status))) {
					if (typeof note !== "string" || !note.trim()) {
						throw new APIError(
							`A mismatch closed as ${status} needs a staff note.`,
							400,
						);
					}
					if (req.user && status !== originalDoc?.status) {
						data.resolvedBy = req.user.id;
					}
				}
				return data;
			},
		],
	},
	fields: [
		{
			name: "run",
			type: "relationship",
			relationTo: "reconciliation-runs",
			index: true,
			access: serviceOnly,
		},
		{
			name: "kind",
			type: "select",
			required: true,
			index: true,
			options: RECONCILIATION_MISMATCH_KINDS.map((value) => ({
				label: value,
				value,
			})),
			access: serviceOnly,
		},
		{ name: "entityType", type: "text", access: serviceOnly },
		{ name: "providerId", type: "text", index: true, access: serviceOnly },
		{ name: "localId", type: "text", index: true, access: serviceOnly },
		{ name: "expected", type: "json", access: serviceOnly },
		{ name: "actual", type: "json", access: serviceOnly },
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			index: true,
			access: serviceOnly,
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "open",
			index: true,
			options: RECONCILIATION_MISMATCH_STATUSES.map((value) => ({
				label: value,
				value,
			})),
		},
		{
			name: "resolvedBy",
			type: "relationship",
			relationTo: "users",
			access: serviceOnly,
		},
		{ name: "note", type: "textarea" },
	],
	timestamps: true,
};
