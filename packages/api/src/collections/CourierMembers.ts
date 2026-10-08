import type { Access, CollectionConfig, Where } from "payload";
import { isModerator } from "../access/roles";
import { staffOnly } from "../access/staff";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { CodedAPIError } from "../lib/serviceError";

const courierMemberRead: Access = async ({ req }) => {
	if (!req.user) return false;
	if (isModerator(req.user)) return true;
	const userId = relationId(req.user);
	if (!userId) return false;
	try {
		const memberships = await req.payload.find({
			collection: "courier-members",
			where: {
				and: [
					{ user: { equals: userId } },
					{ role: { equals: "dispatcher" } },
					{ status: { equals: "active" } },
				],
			},
			depth: 0,
			limit: 100,
			overrideAccess: true,
		});
		const courierIds = memberships.docs.flatMap((row) =>
			row.courier == null
				? []
				: [typeof row.courier === "object" ? row.courier.id : row.courier],
		);
		const clauses: Where[] = [{ user: { equals: userId } }];
		if (courierIds.length > 0) clauses.push({ courier: { in: courierIds } });
		const accessWhere: Where = { or: clauses };
		return accessWhere;
	} catch {
		const own: Where = { user: { equals: userId } };
		return own;
	}
};

export const CourierMembers: CollectionConfig = {
	slug: "courier-members",
	admin: {
		useAsTitle: "user",
		defaultColumns: ["courier", "user", "role", "status"],
	},
	access: {
		read: courierMemberRead,
		create: staffOnly,
		update: staffOnly,
		delete: staffOnly,
	},
	hooks: {
		beforeValidate: [
			async ({ data, originalDoc, req }) => {
				const userId = relationId(data?.user) ?? relationId(originalDoc?.user);
				if (!userId) return data;
				const user = await req.payload.findByID({
					collection: "users",
					id: userId,
					depth: 0,
					overrideAccess: true,
				});
				if (!user.phoneVerifiedAt) {
					throw new CodedAPIError(
						ERROR_CODES.teamPhoneVerificationRequired,
						400,
					);
				}
				return data;
			},
		],
	},
	indexes: [{ fields: ["courier", "user"], unique: true }],
	fields: [
		{
			name: "courier",
			type: "relationship",
			relationTo: "couriers",
			required: true,
			index: true,
		},
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
		},
		{
			name: "role",
			type: "select",
			required: true,
			options: ["dispatcher", "rider"].map((value) => ({
				label: value,
				value,
			})),
		},
		{
			name: "vehicle",
			type: "select",
			options: ["moto", "car", "bicycle", "foot"].map((value) => ({
				label: value,
				value,
			})),
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "active",
			index: true,
			options: ["active", "revoked"].map((value) => ({ label: value, value })),
		},
		{ name: "phoneSharingConsentAt", type: "date" },
	],
	timestamps: true,
};
