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

const adminOnly: Access = ({ req: { user } }) => isAdmin(user);

/**
 * The written evidence that clears P6's dispute gates (G2/G3 to enable
 * disputes, G4 for strike effects and the seller loss fee), filed from the
 * `AppSettings.disputes.gates` rows. Same treatment as `PaymentGateEvidence`:
 * P2's private storage, admin-only.
 */
export const DisputeGateEvidence: CollectionConfig = {
	slug: "dispute-gate-evidence",
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
			"dispute-gates",
		),
		mimeTypes: [...MIME_TYPES],
		imageSizes: [],
		crop: false,
		focalPoint: false,
	},
	timestamps: true,
};
