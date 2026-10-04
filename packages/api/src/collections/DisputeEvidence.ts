import path from "node:path";
import type { CollectionConfig, Where } from "payload";
import { casePartyRead, serviceOnly } from "../access/caseRoles";
import { enforceUploadLimits } from "../hooks/mediaLimits";

export const DISPUTE_EVIDENCE_KINDS = [
	"photo",
	"video",
	"document",
	"payment_proof",
	"shipping_proof",
] as const;
export const DISPUTE_EVIDENCE_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/heic",
	"video/mp4",
	"video/quicktime",
	"application/pdf",
] as const;

const fileLimits = enforceUploadLimits({
	mimeTypes: DISPUTE_EVIDENCE_MIME_TYPES,
	maxBytes: 50 * 1024 * 1024,
	maxBytesByMimeType: {
		"image/jpeg": 10 * 1024 * 1024,
		"image/png": 10 * 1024 * 1024,
		"image/webp": 10 * 1024 * 1024,
		"image/heic": 10 * 1024 * 1024,
		"application/pdf": 10 * 1024 * 1024,
	},
});

export const DisputeEvidence: CollectionConfig = {
	slug: "dispute-evidence",
	admin: {
		useAsTitle: "filename",
		defaultColumns: ["filename", "kind", "visibility", "purgeAfter"],
	},
	access: {
		read: casePartyRead({
			buyerFields: ["dispute.buyer", "returnCase.buyer"],
			shopFields: [
				"dispute.shop",
				"dispute.resale.supplierShop",
				"returnCase.shop",
			],
			constraints: [{ visibility: { equals: "parties" } } as Where],
		}),
		create: serviceOnly,
		update: serviceOnly,
		delete: serviceOnly,
	},
	hooks: {
		beforeOperation: [fileLimits],
		beforeValidate: [
			({ data, operation }) => {
				if (operation !== "create" || !data) return data;
				if (Boolean(data.dispute) === Boolean(data.returnCase))
					throw new Error(
						"Evidence must belong to exactly one dispute or return case.",
					);
				return data;
			},
		],
	},
	fields: [
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
			name: "uploadedByType",
			type: "select",
			required: true,
			options: ["buyer", "seller", "supplier", "moderator", "system"].map(
				(value) => ({ label: value, value }),
			),
		},
		{ name: "uploadedBy", type: "relationship", relationTo: "users" },
		{
			name: "kind",
			type: "select",
			required: true,
			options: DISPUTE_EVIDENCE_KINDS.map((value) => ({ label: value, value })),
		},
		{ name: "mimeType", type: "text", admin: { readOnly: true } },
		{ name: "size", type: "number", admin: { readOnly: true } },
		{ name: "sha256", type: "text", index: true, admin: { readOnly: true } },
		{ name: "capturedAt", type: "date", admin: { readOnly: true } },
		{
			name: "exifStripped",
			type: "checkbox",
			defaultValue: false,
			admin: { readOnly: true },
		},
		{
			name: "visibility",
			type: "select",
			required: true,
			defaultValue: "parties",
			options: ["parties", "staff"].map((value) => ({ label: value, value })),
		},
		{ name: "purgeAfter", type: "date", index: true },
	],
	upload: {
		staticDir: path.resolve(
			process.cwd(),
			process.env.PRIVATE_UPLOADS_DIR ?? "private-uploads/verification",
			"..",
			"dispute-evidence",
		),
		mimeTypes: [...DISPUTE_EVIDENCE_MIME_TYPES],
		imageSizes: [],
		crop: false,
		focalPoint: false,
	},
	timestamps: true,
};
