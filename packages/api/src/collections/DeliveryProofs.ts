import path from "node:path";
import type { CollectionConfig } from "payload";
import { nobody } from "../access/staff";
import { enforceUploadLimits } from "../hooks/mediaLimits";

export const DELIVERY_PROOF_MIME_TYPES = ["image/jpeg", "image/png"] as const;
export const DELIVERY_PROOFS_PREFIX = "delivery-proofs";

export function deliveryProofsDir(
	privateUploadsDir = process.env.PRIVATE_UPLOADS_DIR,
): string {
	return path.resolve(
		process.cwd(),
		privateUploadsDir ?? "private-uploads/verification",
		"..",
		DELIVERY_PROOFS_PREFIX,
	);
}

export const DeliveryProofs: CollectionConfig = {
	slug: "delivery-proofs",
	admin: { hidden: true, useAsTitle: "filename" },
	access: {
		read: nobody,
		create: nobody,
		update: nobody,
		delete: nobody,
		unlock: nobody,
	},
	hooks: {
		beforeOperation: [
			enforceUploadLimits({
				mimeTypes: DELIVERY_PROOF_MIME_TYPES,
				maxBytes: 5 * 1024 * 1024,
			}),
		],
	},
	indexes: [{ fields: ["shipment", "kind"] }],
	fields: [
		{
			name: "shipment",
			type: "relationship",
			relationTo: "shipments",
			required: true,
			index: true,
		},
		{
			name: "kind",
			type: "select",
			required: true,
			options: ["attempt", "handover", "declaration"].map((value) => ({
				label: value,
				value,
			})),
		},
		{ name: "uploadedBy", type: "relationship", relationTo: "users" },
		{
			name: "uploadedVia",
			type: "select",
			required: true,
			options: ["seller_app", "rider_app", "rider_link", "courier_webhook"].map(
				(value) => ({ label: value, value }),
			),
		},
	],
	upload: {
		staticDir: deliveryProofsDir(),
		mimeTypes: [...DELIVERY_PROOF_MIME_TYPES],
		imageSizes: [],
		crop: false,
		focalPoint: false,
		withMetadata: false,
		formatOptions: { format: "jpeg", options: { quality: 90 } },
	},
	timestamps: true,
};
