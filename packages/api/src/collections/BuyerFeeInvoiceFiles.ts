import path from "node:path";
import type { CollectionConfig } from "payload";
import { nobody } from "../access/staff";

/** Resolved per call: the local file route and the collection must agree. */
export function buyerFeeInvoiceFilesDir(
	privateUploadsDir = process.env.PRIVATE_UPLOADS_DIR,
): string {
	return path.resolve(
		process.cwd(),
		privateUploadsDir ?? "private-uploads/verification",
		"..",
		"buyer-fee-invoices",
	);
}

/** The storage prefix `plugins/storage.ts` gives this collection. */
export const BUYER_FEE_INVOICE_FILES_PREFIX = "buyer-fee-invoices";

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
		staticDir: buyerFeeInvoiceFilesDir(),
		mimeTypes: ["application/pdf"],
		imageSizes: [],
		crop: false,
		focalPoint: false,
	},
	timestamps: true,
};
