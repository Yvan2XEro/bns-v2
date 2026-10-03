import path from "node:path";
import type { CollectionConfig } from "payload";
import { nobody } from "../access/staff";

/**
 * The PDFs behind `buyer-fee-invoices.pdf`, in P2's private storage beside
 * identity documents. Every access rule is closed, so Payload's own file route
 * always answers 403: a signed URL (`lib/privateFiles.ts`) is the one door.
 */
export const BuyerFeeInvoiceFiles: CollectionConfig = {
	slug: "buyer-fee-invoice-files",
	admin: { hidden: true, useAsTitle: "filename" },
	access: { read: nobody, create: nobody, update: nobody, delete: nobody },
	fields: [],
	upload: {
		staticDir: path.resolve(
			process.cwd(),
			process.env.PRIVATE_UPLOADS_DIR ?? "private-uploads/verification",
			"..",
			"buyer-fee-invoices",
		),
		mimeTypes: ["application/pdf"],
		imageSizes: [],
		crop: false,
		focalPoint: false,
	},
	timestamps: true,
};
