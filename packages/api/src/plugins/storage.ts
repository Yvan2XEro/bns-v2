import path from "node:path";
import type { Plugin } from "payload";
import { BUYER_FEE_INVOICE_FILES_PREFIX } from "../collections/BuyerFeeInvoiceFiles";
import { DELIVERY_PROOFS_PREFIX } from "../collections/DeliveryProofs";

type StorageProvider = "s3" | "azure" | "local";

interface StorageEnv {
	STORAGE_PROVIDER?: string;
	S3_BUCKET?: string;
	S3_PRIVATE_BUCKET?: string;
	AZURE_STORAGE_CONTAINER_NAME?: string;
	AZURE_STORAGE_PRIVATE_CONTAINER_NAME?: string;
	PRIVATE_UPLOADS_DIR?: string;
	NODE_ENV?: string;
}

/** Matches the hardcoded `staticDir` of the `media` collection. */
const MEDIA_DIR_NAME = "media";
const DEFAULT_PRIVATE_UPLOADS_DIR = "private-uploads/verification";

function getProvider(env: StorageEnv = process.env): StorageProvider {
	const val = env.STORAGE_PROVIDER?.toLowerCase();
	if (val === "s3") return "s3";
	if (val === "azure") return "azure";
	return "local";
}

// Collections that use file storage in the public bucket/container.
const storageCollections = { media: true } as const;

/**
 * Identity documents and P5's gate evidence each live under their own prefix
 * in the one private bucket/container.
 */
const privateCollections = {
	"verification-documents": { prefix: "verification" },
	"payment-gate-evidence": { prefix: "payment-gates" },
	"dispute-gate-evidence": { prefix: "dispute-gates" },
	"dispute-evidence": { prefix: "dispute-evidence" },
	"buyer-fee-invoice-files": { prefix: BUYER_FEE_INVOICE_FILES_PREFIX },
	"delivery-proofs": { prefix: DELIVERY_PROOFS_PREFIX },
} as const;

/**
 * Checked at config build time, on the environment alone.
 *
 * Deliberately NOT conditioned on `AppSettings.verification.enabled`: the
 * config is built before the database is reachable, so a check that read the
 * flag would either block startup on a database round trip or silently pass.
 * The rule this enforces is the one that matters either way — if this
 * deployment stores files at all, identity documents are not in the bucket the
 * CDN serves.
 *
 * `local` is a legitimate production configuration, not merely a dev
 * convenience: Payload serves it through the same `nobody`-access
 * `staticDir`/file-route path as any other collection (see the document-access
 * matrix in the P2 final review), and the private path is HMAC-signed on the
 * way out (`lib/privateFiles.ts`). What actually protects it is that its
 * `staticDir` is distinct from the public `media` one — the same "not the
 * bucket the CDN serves" rule S3 and Azure enforce with a distinct
 * bucket/container name — so that is what this checks instead of the
 * environment.
 */
export function assertPrivateStorageConfig(
	env: StorageEnv = process.env,
): string | null {
	const provider = getProvider(env);

	if (provider === "local") {
		const mediaDir = path.resolve(process.cwd(), MEDIA_DIR_NAME);
		const privateDir = path.resolve(
			process.cwd(),
			env.PRIVATE_UPLOADS_DIR?.trim() || DEFAULT_PRIVATE_UPLOADS_DIR,
		);
		if (privateDir === mediaDir) {
			return "PRIVATE_UPLOADS_DIR resolves to the same directory as the media collection; identity documents would be served from the public media path.";
		}
		return null;
	}

	if (provider === "s3") {
		const priv = env.S3_PRIVATE_BUCKET?.trim() ?? "";
		if (!priv) {
			return "S3_PRIVATE_BUCKET is empty; identity documents have nowhere private to go.";
		}
		if (priv === (env.S3_BUCKET?.trim() ?? "")) {
			return "S3_PRIVATE_BUCKET is the same bucket as S3_BUCKET; identity documents would be served publicly.";
		}
		return null;
	}

	const container = env.AZURE_STORAGE_PRIVATE_CONTAINER_NAME?.trim() ?? "";
	if (!container) {
		return "AZURE_STORAGE_PRIVATE_CONTAINER_NAME is empty; identity documents have nowhere private to go.";
	}
	if (container === (env.AZURE_STORAGE_CONTAINER_NAME?.trim() ?? "")) {
		return "AZURE_STORAGE_PRIVATE_CONTAINER_NAME is the same container as AZURE_STORAGE_CONTAINER_NAME.";
	}
	return null;
}

export async function buildStoragePlugins(): Promise<Plugin[]> {
	const provider = getProvider();
	const refusal = assertPrivateStorageConfig();
	if (refusal) throw new Error(`[storage] ${refusal}`);

	if (provider === "s3") {
		const { s3Storage } = await import("@payloadcms/storage-s3");
		const config = {
			credentials: {
				accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
				secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
			},
			region: process.env.S3_REGION ?? "us-east-1",
			...(process.env.S3_ENDPOINT && {
				endpoint: process.env.S3_ENDPOINT,
				forcePathStyle: true,
			}),
		};
		return [
			s3Storage({
				collections: storageCollections,
				bucket: process.env.S3_BUCKET ?? "",
				config,
			}),
			s3Storage({
				collections: privateCollections,
				bucket: process.env.S3_PRIVATE_BUCKET ?? "",
				acl: "private",
				// Identity documents are never uploaded from the browser (the
				// collection's access control has no open `create`), so the
				// plugin's direct-to-bucket client upload path is disabled here
				// rather than left to its default.
				clientUploads: false,
				config,
			}),
		];
	}

	if (provider === "azure") {
		const { azureStorage } = await import("@payloadcms/storage-azure");
		const base = {
			baseURL: process.env.AZURE_STORAGE_ACCOUNT_BASEURL ?? "",
			connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING ?? "",
			allowContainerCreate:
				process.env.AZURE_STORAGE_ALLOW_CONTAINER_CREATE === "true",
		};
		return [
			azureStorage({
				...base,
				collections: storageCollections,
				containerName: process.env.AZURE_STORAGE_CONTAINER_NAME ?? "",
			}),
			azureStorage({
				...base,
				// Never spread the flag here: `@payloadcms/storage-azure` hard-codes
				// `createIfNotExists({ access: "blob" })` — Azure's anonymous public
				// read — for any plugin instance with container creation on. The
				// private container must never be created that way, regardless of
				// what AZURE_STORAGE_ALLOW_CONTAINER_CREATE says; it is created out
				// of band with a private access level instead.
				allowContainerCreate: false,
				collections: privateCollections,
				containerName: process.env.AZURE_STORAGE_PRIVATE_CONTAINER_NAME ?? "",
			}),
		];
	}

	// local: Payload stores both collections natively, each in its own staticDir.
	return [];
}
