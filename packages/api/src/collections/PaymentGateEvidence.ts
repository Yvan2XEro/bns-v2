import path from "node:path";
import type { Access, CollectionConfig } from "payload";
import { isAdmin } from "../access/roles";
import { enforceUploadLimits } from "../hooks/mediaLimits";

const MIME_TYPES = [
	"application/pdf",
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

const adminOnly: Access = ({ req: { user } }) =>
	isAdmin(user as { role?: string } | null);

/**
 * The written answers that clear P5's launch gates (provider letters, the
 * lawyer's opinion, sandbox runs), filed from the `AppSettings.payments.gates`
 * rows. Contracts and legal opinions, so they sit in P2's private storage
 * beside identity documents — a sibling directory of the same volume locally,
 * the private bucket/container under its own prefix otherwise
 * (`plugins/storage.ts`) — and only admins can see them.
 */
export const PaymentGateEvidence: CollectionConfig = {
	slug: "payment-gate-evidence",
	admin: { group: "Configuration", useAsTitle: "filename" },
	access: {
		read: adminOnly,
		create: adminOnly,
		update: adminOnly,
		delete: adminOnly,
	},
	hooks: {
		beforeOperation: [
			enforceUploadLimits({
				mimeTypes: MIME_TYPES,
				maxBytes: 20 * 1024 * 1024,
			}),
		],
	},
	fields: [],
	upload: {
		staticDir: path.resolve(
			process.cwd(),
			process.env.PRIVATE_UPLOADS_DIR ?? "private-uploads/verification",
			"..",
			"payment-gates",
		),
		mimeTypes: [...MIME_TYPES],
		imageSizes: [],
		crop: false,
		focalPoint: false,
	},
	timestamps: true,
};
