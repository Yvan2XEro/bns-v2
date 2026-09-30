import path from "node:path";
import type { CollectionConfig } from "payload";
import { nobody } from "../access/staff";
import { enforceUploadLimits } from "../hooks/mediaLimits";

export const VERIFICATION_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
] as const;
export const MAX_VERIFICATION_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_REQUEST = 10;

export const DOCUMENT_KINDS = [
	"rccm_extract",
	"entreprenant_declaration",
	"niu_certificate",
	"legal_representative_id",
	"mandate",
	"proof_of_address",
	"other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/**
 * These are identity papers, stored under a `staticDir` outside the public
 * media tree. Every access rule is closed, admins included, so Payload's own
 * file route `/api/verification-documents/file/*` always answers 403. The
 * single way to see a document is the signed-URL route (a later task), which
 * writes a `verification-document-views` row before it hands the URL back —
 * "every look at an identity document is on the record" is only true if
 * there is no second door.
 */
export const VerificationDocuments: CollectionConfig = {
	slug: "verification-documents",
	admin: { hidden: true, useAsTitle: "originalFilename" },
	access: { read: nobody, create: nobody, update: nobody, delete: nobody },
	hooks: {
		beforeOperation: [
			enforceUploadLimits({
				mimeTypes: VERIFICATION_MIME_TYPES,
				maxBytes: MAX_VERIFICATION_FILE_SIZE,
			}),
		],
	},
	fields: [
		{
			name: "request",
			type: "relationship",
			relationTo: "verification-requests",
			required: true,
			index: true,
		},
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			required: true,
			index: true,
		},
		{
			name: "kind",
			type: "select",
			required: true,
			options: DOCUMENT_KINDS.map((value) => ({ label: value, value })),
		},
		{ name: "sha256", type: "text", index: true },
		{
			// The stored `filename` is `{uuid}.{ext}`: a seller's own filename can
			// carry their name, and a filename is the one part of an upload that
			// ends up in a URL.
			name: "originalFilename",
			type: "text",
		},
		{ name: "uploadedBy", type: "relationship", relationTo: "users" },
		{
			name: "duplicateOf",
			type: "relationship",
			relationTo: "verification-documents",
			hasMany: true,
		},
		{ name: "purgedAt", type: "date", index: true },
	],
	upload: {
		staticDir: path.resolve(
			process.cwd(),
			process.env.PRIVATE_UPLOADS_DIR ?? "private-uploads/verification",
		),
		mimeTypes: [...VERIFICATION_MIME_TYPES],
		imageSizes: [],
		crop: false,
		focalPoint: false,
		disableLocalStorage: false,
	},
	timestamps: true,
};
